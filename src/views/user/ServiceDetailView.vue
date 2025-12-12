<script setup>
// ================= import ==================
import { watch, onMounted, onBeforeUnmount, reactive, ref, computed } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useAuthStore } from '@/stores/UseStore'

import Input from '@/components/Input.vue'
import Button from '@/components/Button.vue'
import Calendar from '@/components/Calendar.vue'
import Modal from '@/components/Modal.vue'
import SeatBoard from '@/components/SeatBoard.vue'

import ServiceApi from '@/services/user/service_api'
import ReservationApi from '@/services/reservation/reservation_api'
import HoldApi from '@/services/reservation/hold_api'

import {
  connectWebSocket,
  disconnectWebSocket,
  subscribe,
  unsubscribe,
  isConnected,
} from '@/utils/webSocket'

// =============== definition ================
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const resourceId = ref(null)

const today = new Date()
const todayStr = today.toISOString().slice(0, 10) // yyyy-mm-dd

const dayMap = { SUN: '일', MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토' }

const showSeatModal = ref(false) // 좌석 선택 모달 활성화 여부
const showCalendar = ref(false) // Calendar 모달 활성화 여부

const service = reactive({}) // 리소스 정보
const resourceCustomFieldValues = reactive([]) // 리소스 커스텀 필드 값 (조회용)
const userCustomFields = reactive([]) // 사용자 입력 커스텀 필드
const userCustomFieldValuesForm = reactive([]) // 사용자 입력 커스텀 필드 값 요청 폼 (입력용)
const times = reactive([]) // 정규 운영 시간
const exceptionTimeSlots = reactive([]) // 예외 운영 시간
const yearMonthTimeSlots = ref([]) // 년/월 선택에 따른 모든 일자 별의 운영 가능 시간
const resourceReservations = ref([]) // 특정 리소스의 예약 목록
const reservedTimes = ref([]) // 특정 리소스에 예약된 시간 목록 저장할 배열

const availableTimes = ref([]) // 선택 가능한 운영 시간 목록 (버튼용)
const selectedDate = ref(new Date().toISOString().slice(0, 10)) // 선택한 날짜
const selectedTime = ref(null) // 선택한 시간
const selectedYear = ref(new Date().getFullYear()) // 선택한 년도
const selectedMonth = ref(new Date().getMonth() + 1) // 선택한 월
const selectedHeadCount = ref(1) // 선택한 인원수
const selectedRow = ref(null) // 선택한 좌석 행
const selectedCol = ref(null) // 선택한 좌석 열

// 예약 요청 폼
const reservationForm = computed(() => ({
  date: selectedDate.value,
  time: selectedTime.value,
  headCount: selectedHeadCount.value,
  row: selectedRow.value,
  col: selectedCol.value,
  customFieldValues: userCustomFieldValuesForm,
}))

// =============== 입장 토큰 타이머 ================
let remainingSeconds = 0
let countdownTimer = null
let holdTimer = null

// =============== Hold 상태 ================
const currentHold = reactive({
  date: null,
  time: null,
  row: null,
  col: null,
})
const holdList = ref([]) // 현재 날짜의 Hold 목록
let holdSubscription = null // WebSocket 구독

// ================== api 요청 ==================
// --- 리소스 상세 조회
const getService = async () => {
  const response = await ServiceApi.getService(route.params.itemId)
  Object.assign(service, response)
}

// --- 리소스의 커스텀 필드 값 조회
const getResourceCustomFieldValues = async () => {
  const response = await ServiceApi.getResourceCustomFieldValues(route.params.itemId)
  Object.assign(resourceCustomFieldValues, response)
}

// --- 사용자 입력 커스텀 필드 조회
const getUserCustomFields = async () => {
  const response = await ServiceApi.getUserCustomFields(route.params.serviceGroupId)
  Object.assign(userCustomFields, response)
  Object.assign(
    userCustomFieldValuesForm,
    userCustomFields.map((field) => ({
      customFieldId: field.id,
      values: [''],
    })),
  )
}

// --- 정규 운영 시간 조회
const getTimeSlots = async () => {
  const response = await ServiceApi.getTimeSlots(route.params.itemId)
  Object.assign(times, response)

  // 요일별 시간 매핑
  const grouped = {}
  times.forEach((slot) => {
    if (!grouped[slot.dayOfWeek]) grouped[slot.dayOfWeek] = []
    grouped[slot.dayOfWeek].push(`${slot.startTime} - ${slot.endTime}`)
  })

  // 한글 요일로 변환해서 저장
  resourceCustomFieldValues.dailyTimeSlots = Object.entries(grouped).map(([day, slots]) => ({
    day: dayMap[day] || day,
    slots,
  }))
}

// --- 예외 운영 시간 조회
const getExceptionTimeSlots = async () => {
  const response = await ServiceApi.getExceptionTimeSlots(route.params.itemId)
  Object.assign(exceptionTimeSlots, response)

  // 날짜별 그룹핑
  const groupedExceptions = {}
  exceptionTimeSlots.forEach((ex) => {
    if (!groupedExceptions[ex.date]) groupedExceptions[ex.date] = []

    if (ex.closed) {
      groupedExceptions[ex.date].push(ex.note ? `휴무 (${ex.note})` : '휴무') // 휴무일
    } else {
      groupedExceptions[ex.date].push(`${ex.startTime} - ${ex.endTime}`) // 일반 예외 시간
    }
  })

  // 한글 요일로 변환
  resourceCustomFieldValues.exceptionTimeSlots = Object.entries(groupedExceptions).map(
    ([date, slots]) => ({
      date,
      slots,
    }),
  )
}

// --- 년/월 선택에 따른 예외 포함한 운영 시간 조회
const getYearMonthTimeSlots = async (serviceId, year, month) => {
  const response = await ServiceApi.getYearMonthTimeSlots(serviceId, year, month)
  yearMonthTimeSlots.value = response || []
  updateAvailableTimes(selectedDate.value) // 데이터 로드 후 선택한 날짜의 선택 가능 시간 업데이트
}

// --- 특정 리소스에 예약된 목록 조회
const getResourceReservations = async (startDate, endDate) => {
  const response = await ReservationApi.getResourceReservations(
    route.params.itemId,
    startDate,
    endDate,
  )

  if (response && response.isSuccess) {
    resourceReservations.value = response.data.list.filter((res) => res.status === 'CONFIRMED')
    reservedTimes.value = response.data.list.map((res) => res.startDate.slice(11, 16)) // 예약된 시간만 추출해서 배열로 저장 "09:00"
    console.log('🌟예약된 시간 추출 : ', reservedTimes)
  } else {
    alert('잘못된 요청입니다.')
  }
}

// --- 예약 요청
const reserve = async () => {
  const confirmed = window.confirm('예약을 하시겠습니까?')
  if (!confirmed) return

  try {
    const response = await ReservationApi.reserve(route.params.itemId, reservationForm.value)

    if (response && response.isSuccess) {
      const slug = route.params.companySlug || authStore.companySlug || 'default'
      router.push(`/c/${slug}/reservation/completed/${response.data.id}`)
    } else {
      // 백엔드 에러 메시지 표시
      const errorMessage = response?.message || '예약에 실패했습니다.'
      alert(errorMessage)
    }
  } catch (error) {
    console.error('[Reserve] 예약 실패:', error)

    // 백엔드 응답에서 에러 메시지 추출
    const errorMessage = error.response?.data?.message || '예약 처리 중 오류가 발생했습니다.'
    alert(errorMessage)
  }
}

// =============== Hold API ================
/** Hold 생성 (시간/좌석 선택 시) */
const createHold = async (date, time, row = null, col = null) => {
  try {
    const response = await HoldApi.createHold(resourceId.value, {
      date,
      time,
      row,
      col,
      ttl: remainingSeconds, // 남은 페이지 TTL 전달
    })

    if (response.success) {
      currentHold.date = date
      currentHold.time = time
      currentHold.row = row
      currentHold.col = col

      // Hold 타이머는 페이지 TTL과 동기화되므로 별도 타이머 불필요
      // startHoldTimer 제거 또는 유지 (선택)

      return true
    } else {
      alert(response.message)
      return false
    }
  } catch (error) {
    console.error('[Hold] 생성 실패:', error)
    alert('선택에 실패했습니다. 다시 시도해주세요.')
    return false
  }
}

/** Hold 해제 (선택 취소 시) */
const releaseHold = async () => {
  if (!currentHold.date || !currentHold.time) return
  if (!resourceId.value) return // 추가

  try {
    await HoldApi.releaseHold(resourceId.value, {
      date: currentHold.date,
      time: currentHold.time,
      row: currentHold.row,
      col: currentHold.col,
    })

    // Hold 상태 초기화
    currentHold.date = null
    currentHold.time = null
    currentHold.row = null
    currentHold.col = null
  } catch (error) {
    console.error('[Hold] 해제 실패:', error)
  }
}

/** Hold 상태 조회 */
const fetchHoldStatus = async () => {
  try {
    const response = await HoldApi.getHoldStatus(resourceId.value, selectedDate.value)
    holdList.value = response.holds || []
  } catch (error) {
    console.error('[Hold] 상태 조회 실패:', error)
  }
}

/** 시간대가 Hold 되어있는지 확인 (RESERVATION 카테고리 전용) */
const isTimeHeld = (time) => {
  // SEAT 카테고리는 시간 Hold가 없음 (좌석 Hold만 존재)
  if (service.category === 'SEAT') {
    return false
  }

  // RESERVATION 카테고리: row/col이 null인 Hold만 확인
  return holdList.value.some(
    (hold) => hold.time === time && hold.row === null && hold.col === null && !isMyHold(hold),
  )
}

/** 좌석이 Hold 되어있는지 확인 */
const isSeatHeld = (row, col) => {
  return holdList.value.some((hold) => hold.row === row && hold.col === col && !isMyHold(hold))
}

/** 내 Hold인지 확인 */
const isMyHold = (hold) => {
  return (
    currentHold.date === hold.date &&
    currentHold.time === hold.time &&
    currentHold.row === hold.row &&
    currentHold.col === hold.col
  )
}

/** 시간 선택 핸들러 */
const handleTimeSelect = async (time) => {
  // 이미 마감된 시간 체크
  if (isTimeClosed(time)) return

  // === SEAT 카테고리: Hold 없이 시간만 선택 ===
  if (service.category === 'SEAT') {
    selectedTime.value = time
    return
  }

  // === RESERVATION 카테고리: 시간 선택 시 Hold 생성 ===
  // 다른 사용자가 Hold 중인지 체크
  if (isTimeHeld(time)) {
    alert('해당 시간은 다른 사용자가 선택 중입니다.')
    return
  }

  // 이전 Hold 해제
  if (currentHold.time && currentHold.time !== time) {
    await releaseHold()
  }

  // Hold 생성
  const success = await createHold(selectedDate.value, time)
  if (success) {
    selectedTime.value = time
  }
}

/** Hold 타이머 시작 */
const startHoldTimer = (seconds) => {
  // 기존 타이머 정리
  if (holdTimer) {
    clearTimeout(holdTimer)
  }

  holdTimer = setTimeout(() => {
    // Hold 만료 처리
    alert('선택 시간이 만료되었습니다. 다시 선택해주세요.')

    // 선택 상태 초기화
    selectedTime.value = null
    currentHold.date = null
    currentHold.time = null
    currentHold.row = null
    currentHold.col = null

    // Hold 상태 재조회 (다른 사용자 Hold 반영)
    fetchHoldStatus()
  }, seconds * 1000)
}

/** Hold 타이머 정리 */
const clearHoldTimer = () => {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

/** 새로고침/탭 닫기 시 Hold 해제 (sendBeacon 사용) */
const handleBeforeUnload = () => {
  if (!currentHold.date || !currentHold.time || !resourceId.value) return

  // sendBeacon으로 동기적 API 호출 (새로고침에도 작동)
  const url = `${import.meta.env.VITE_API_BASE_URL}/api/hold/${resourceId.value}/release`
  const data = JSON.stringify({
    date: currentHold.date,
    time: currentHold.time,
    row: currentHold.row,
    col: currentHold.col,
  })

  navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }))
  console.log('[Hold] beforeunload → sendBeacon 호출')
}

// =============== WebSocket ================
/** WebSocket 연결 및 Hold 토픽 구독 */
const connectHoldWebSocket = async () => {
  try {
    // 이미 연결되어 있지 않으면 연결 (await 필수)
    if (!isConnected()) {
      await connectWebSocket()
    }

    // 연결 완료 대기 (약간의 딜레이)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Hold 토픽 구독
    const topic = `/topic/hold/${resourceId.value}`
    holdSubscription = subscribe(topic, handleHoldMessage)
    console.log('🔌 Hold 토픽 구독:', topic)
  } catch (error) {
    console.error('[Hold WebSocket] 연결 실패:', error)
  }
}

/** WebSocket 메시지 처리 */
const handleHoldMessage = (message) => {
  console.log('[Hold WebSocket] 메시지 수신:', message)

  // 현재 선택한 날짜와 다르면 무시
  if (message.date !== selectedDate.value) return

  switch (message.type) {
    case 'HOLD_CREATED':
      addHoldToList(message)
      break

    case 'HOLD_RELEASED':
      removeHoldFromList(message)
      break

    case 'RESERVATION_COMPLETED':
      removeHoldFromList(message)
      refreshReservations()
      break
  }
}

/** Hold 목록에 추가 (새 배열 할당으로 반응성 보장) */
const addHoldToList = (message) => {
  const exists = holdList.value.some(
    (h) => h.time === message.time && h.row === message.row && h.col === message.col,
  )
  if (!exists) {
    // 새 배열 할당 (Vue 반응성 트리거)
    holdList.value = [
      ...holdList.value,
      {
        date: message.date,
        time: message.time,
        row: message.row,
        col: message.col,
      },
    ]
  }
}

/** Hold 목록에서 제거 */
const removeHoldFromList = (message) => {
  holdList.value = holdList.value.filter(
    (h) => !(h.time === message.time && h.row === message.row && h.col === message.col),
  )
}

/** 예약 목록 갱신 */
const refreshReservations = () => {
  getResourceReservations(
    toLocalDateTimeStart(selectedDate.value),
    toLocalDateTimeEnd(selectedDate.value),
  )
}

/** Hold 토픽 구독 해제 */
const disconnectHoldWebSocket = () => {
  if (holdSubscription) {
    unsubscribe(holdSubscription)
    holdSubscription = null
  }
}

// =============== 입장 토큰 타이머 ================
/** 카운트다운 시작 */
const startCountdown = () => {
  countdownTimer = setInterval(async () => {
    remainingSeconds--

    if (remainingSeconds <= 0) {
      clearInterval(countdownTimer)
      await handleTokenExpired()
    }
  }, 1000)
}

/** 토큰 만료 처리 */
const handleTokenExpired = async () => {
  // Hold 타이머 정리
  clearHoldTimer()

  // Hold 해제 (Redis에서 삭제)
  await releaseHold()

  alert('예약 시간이 만료되었습니다. 다시 대기열에 참여해주세요.')

  const serviceGroupId = route.params.serviceGroupId
  const companySlug = route.params.companySlug
  router.replace(`/c/${companySlug}/services/${serviceGroupId}`)
}

// ================ function ==================
// --- 커스텀 필드의 값이 여러개 일 경우 표현 형식 변환
const formatCustomFieldValues = (values) => {
  const data = ref('')
  for (value in values) {
    data.value.concat(value + ' ')
  }
  return data
}

// --- 종결 부호마다 줄바꿈 처리
const formatNewLine = (dataString) => {
  if (!dataString) return ''
  return dataString.replace(/[.!?]\s*/g, '$&<br/>').trim()
}

// --- 날짜 선택에 따른 Calendar 모달 토클
const toggleCalendar = () => {
  showCalendar.value = !showCalendar.value
}

// --- Calendar에서 날짜 선택했을 때
const selectDate = (date) => {
  selectedDate.value = date
  showCalendar.value = false // Calendar 모달 닫기

  const [year, month] = date.split('-').map(Number) // 선택한 date에서 year, month 추출

  // 현재 yearMonthTimeSlots가 다른 달이면 api 재호출
  const firstItem = yearMonthTimeSlots.value[0]
  if (!firstItem || !firstItem.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)) {
    getYearMonthTimeSlots(route.params.itemId, year, month)
  }
}

// --- 날짜 LocalDate로 변환
const toLocalDateTimeStart = (dateString) => {
  return `${dateString}T00:00:00`
}
const toLocalDateTimeEnd = (dateString) => {
  return `${dateString}T23:59:59`
}

// --- 선택한 날짜의 운영 시간 업데이트
const updateAvailableTimes = (date) => {
  if (!Array.isArray(yearMonthTimeSlots.value)) return

  const target = yearMonthTimeSlots.value.find((d) => d.date === date)

  if (!target || target.closed) {
    availableTimes.value = []
    return
  }

  availableTimes.value = target.slots || []
}

// --- 선택한 날짜가 바뀔 때마다 요일별 시간 재계산 및 날짜가 바뀌면 선택 값들도 초기화
watch(selectedDate, async () => {
  selectedTime.value = null
  selectedRow.value = null
  selectedCol.value = null
  selectedHeadCount.value = 1
  availableTimes.value = []
  userCustomFieldValuesForm.forEach((field) => {
    field.values = field.values.map(() => '') // 기존 값들을 모두 빈 문자열로 초기화
  })

  if (!selectedDate.value || yearMonthTimeSlots.value.length === 0) return

  // 현재 선택한 날짜에 해당하는 시간 슬롯 목록 찾기
  const daySlot = yearMonthTimeSlots.value.find((d) => d.date === selectedDate.value)

  if (!daySlot) {
    availableTimes.value = []
    return
  }

  // 휴무 처리
  if (daySlot.closed) {
    availableTimes.value = []
    return
  }

  // 해당 날짜에 맞춰 시간 리스트 생성
  availableTimes.value = daySlot.slots.map((slot) => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
  }))

  // 특정 리소스에 예약된 목록 조회 (await 추가)
  await getResourceReservations(
    toLocalDateTimeStart(selectedDate.value),
    toLocalDateTimeEnd(selectedDate.value),
  )

  // Hold 상태 조회 (await 추가)
  await fetchHoldStatus()

  // 시간대가 1개일 때 자동 선택 (await 추가 + isTimeHeld 체크)
  if (availableTimes.value.length === 1) {
    const singleTime = availableTimes.value[0].startTime
    if (!isTimeClosed(singleTime) && !isTimeHeld(singleTime)) {
      await handleTimeSelect(singleTime)
    }
  }
})

// -- 선택한 시간이 변경되면 선택 값들 초기화
watch(selectedTime, () => {
  selectedRow.value = null
  selectedCol.value = null
  selectedHeadCount.value = 1
  userCustomFieldValuesForm.forEach((field) => {
    field.values = field.values.map(() => '')
  })
})

// --- 년/월 선택 변경에 따른 예외 포함 운영 가능 시간 변경
watch([selectedYear, selectedMonth], async ([year, month]) => {
  await getYearMonthTimeSlots(route.params.itemId, year, month)
})

// --- 해당 시간대 마감 여부 계산
const isTimeClosed = (time) => {
  if (service.category === 'RESERVATION') {
    return reservedTimes.value.includes(time)
  }

  if (service.category === 'SEAT') {
    // 현재 시간대에 예약된 좌석 수
    const reservedCount = resourceReservations.value.filter(
      (r) => r.startDate.slice(11, 16) === time,
    ).length

    // 좌석 전부 예약되었으면 마감
    return reservedCount >= service.capacity
  }

  return false
}

// --- 인원수 증감
const increase = () => {
  if (selectedHeadCount.value < service.capacity) selectedHeadCount.value += 1
}
const decrease = () => {
  if (selectedHeadCount.value > 1) selectedHeadCount.value -= 1
}

// --- 좌석 선택 (Optimistic UI + Hold 생성)
const selectSeat = async ({ row, col }) => {
  // 다른 사용자가 Hold 중인지 체크
  if (isSeatHeld(row, col)) {
    alert('해당 좌석은 다른 사용자가 선택 중입니다.')
    return
  }

  // 이미 예약된 좌석인지 체크
  const isReserved = resourceReservations.value.some(
    (r) => r.startDate.slice(11, 16) === selectedTime.value && r.row === row && r.col === col,
  )
  if (isReserved) {
    alert('이미 예약된 좌석입니다.')
    return
  }

  // 이전 Hold 해제 (다른 좌석 선택했을 때)
  if (currentHold.row !== null && (currentHold.row !== row || currentHold.col !== col)) {
    // 이전 Hold를 holdList에서 제거
    holdList.value = holdList.value.filter(
      (h) =>
        !(h.time === currentHold.time && h.row === currentHold.row && h.col === currentHold.col),
    )
    await releaseHold()
  }

  // === Optimistic UI: 클릭 즉시 holdList에 추가 (노란색 표시) ===
  const optimisticHold = {
    date: selectedDate.value,
    time: selectedTime.value,
    row: row,
    col: col,
  }
  holdList.value = [...holdList.value, optimisticHold]

  // Hold 생성 API 호출
  const success = await createHold(selectedDate.value, selectedTime.value, row, col)

  if (success) {
    selectedRow.value = row
    selectedCol.value = col
  } else {
    // === 실패 시 롤백: holdList에서 제거 ===
    holdList.value = holdList.value.filter(
      (h) => !(h.time === selectedTime.value && h.row === row && h.col === col),
    )
  }
}

// --- 선택 불가능한 날짜 계산
const disabledDates = computed(() => {
  if (!service || !service.startDate) return []

  const disabled = []
  const start = new Date(service.startDate)
  const end = new Date(service.endDate)

  // 어제까지 비활성화
  let past = new Date('2020-01-01')
  while (past < new Date(todayStr)) {
    disabled.push(past.toISOString().slice(0, 10))
    past.setDate(past.getDate() + 1)
  }

  // 서비스 이전 날짜 비활성화
  let before = new Date('2020-01-01')
  while (before < start) {
    if (!disabled.includes(before.toISOString().slice(0, 10))) {
      disabled.push(before.toISOString().slice(0, 10))
    }
    before.setDate(before.getDate() + 1)
  }

  // 서비스 이후 날짜 비활성화
  let after = new Date(end)
  after.setDate(after.getDate() + 1)
  while (after < new Date('2030-12-31')) {
    disabled.push(after.toISOString().slice(0, 10))
    after.setDate(after.getDate() + 1)
  }

  return disabled
})

// --- 체크박스 값 배열 관리
const onCheckboxChange = (index, option, checked) => {
  const arr = userCustomFieldValuesForm[index].values

  if (checked) {
    if (!arr.includes(option)) arr.push(option)
  } else {
    const i = arr.indexOf(option)
    if (i > -1) arr.splice(i, 1)
  }
}

// =============== 화면 로드시 데이터 조회 ===============
onMounted(async () => {
  // === 새로고침 감지 (진입 토큰 검증) ===
  const entryToken = sessionStorage.getItem('entryToken')
  const storedResourceId = sessionStorage.getItem('entryResourceId')
  const enterTokenTTL = sessionStorage.getItem('enterTokenTTL')

  // 정상 진입이 아니면 서비스 목록으로 이동
  if (!entryToken || storedResourceId !== route.params.itemId || !enterTokenTTL) {
    console.log('[ServiceDetail] 비정상 진입 감지 → 서비스 목록으로 이동')
    const serviceGroupId = route.params.serviceGroupId
    const companySlug = route.params.companySlug
    router.replace(`/c/${companySlug}/services/${serviceGroupId}`)
    return
  }

  // 백엔드 TTL 적용
  remainingSeconds = Number(enterTokenTTL)

  // 진입 토큰 삭제 (재사용 방지)
  sessionStorage.removeItem('entryToken')
  sessionStorage.removeItem('entryResourceId')
  sessionStorage.removeItem('enterTokenTTL')

  // 진입 시 경고 알림
  alert('⚠️ 새로고침 또는 뒤로가기 시 다시 대기열에 참여해야 합니다.')

  // resourceId 저장 (페이지 이탈 시에도 사용 가능)
  resourceId.value = route.params.itemId

  // === 새로고침/탭 닫기 시 Hold 해제 이벤트 등록 ===
  window.addEventListener('beforeunload', handleBeforeUnload)

  // 1) Hold WebSocket 먼저 연결 (await)
  await connectHoldWebSocket()

  // 2) 데이터 로드
  getService()
  getResourceCustomFieldValues()
  getUserCustomFields()
  getTimeSlots()
  getExceptionTimeSlots()
  await getYearMonthTimeSlots(route.params.itemId, today.getFullYear(), today.getMonth() + 1)
  await getResourceReservations(toLocalDateTimeStart(todayStr), toLocalDateTimeEnd(todayStr))

  // 3) 입장 토큰 타이머 시작
  startCountdown()

  // 4) Hold 상태 조회 및 시간대 자동선택 (초기 로드 시)
  await fetchHoldStatus()

  // 시간대가 1개일 때 자동 선택
  if (availableTimes.value.length === 1) {
    const singleTime = availableTimes.value[0].startTime
    if (!isTimeClosed(singleTime)) {
      await handleTimeSelect(singleTime)
    }
  }
})

// 컴포넌트 언마운트 시 정리
onBeforeUnmount(() => {
  // 입장 토큰 타이머 정리
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
  // Hold 타이머 정리
  clearHoldTimer()
  // 페이지 이탈 시 Hold 해제
  releaseHold()
  // Hold WebSocket 구독 해제
  disconnectHoldWebSocket()
  // beforeunload 이벤트 리스너 제거
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

// 뒤로가기/페이지 이탈 시 서비스 목록으로 이동
onBeforeRouteLeave((to, from, next) => {
  const serviceGroupId = route.params.serviceGroupId
  const companySlug = route.params.companySlug
  const serviceListPath = `/c/${companySlug}/services/${serviceGroupId}`

  // 예약 완료 페이지로 가는 경우는 허용
  if (to.path.includes('/reservation/completed')) {
    next()
    return
  }

  // 서비스 목록으로 가는 경우는 허용 (무한 루프 방지)
  if (to.path.startsWith(serviceListPath) && !to.path.includes('/detail/')) {
    next()
    return
  }

  // 그 외 이탈 시 → 서비스 목록으로 리다이렉트
  console.log('[ServiceDetail] 페이지 이탈 → 서비스 목록으로 이동')
  next({ path: serviceListPath, replace: true })
})
</script>

<template>
  <div class="detail-page">
    <!-- 좌석 선택 모달 -->
    <Modal :open="showSeatModal" :closeOnOverlay="false" @close="showSeatModal = false">
      <SeatBoard
        :service="service"
        :selectedTime="selectedTime"
        :resourceReservations="resourceReservations"
        :holdList="holdList"
        :currentHold="currentHold"
        @selectSeat="selectSeat"
      />
      <div class="p-6">
        <Button @click="showSeatModal = false">선택하기</Button>
      </div>
    </Modal>

    <!-- 상단 이미지 -->
    <img
      :src="service.resourceImage || '/assets/images/no-image.png'"
      alt="회의실"
      class="header-image"
    />

    <div class="content-wrapper">
      <!-- 왼쪽 영역 -->
      <div class="info-section">
        <h2 class="title">{{ service.name }}</h2>
        <p class="desc" v-html="formatNewLine(service.description)"></p>
        <table class="details-table">
          <tbody>
            <!-- 카테고리 별 고정 필드 -->
            <tr v-if="service.category === 'RESERVATION' || service.category === 'SEAT'">
              <th>운영 시간</th>
              <td>
                <table class="inner-table">
                  <tbody>
                    <tr
                      v-for="(daySlot, index) in resourceCustomFieldValues.dailyTimeSlots"
                      :key="index"
                    >
                      <td class="font-semibold align-top w-8">{{ daySlot.day }}</td>
                      <td>
                        <div v-for="(slot, sIndex) in daySlot.slots" :key="sIndex">
                          {{ slot }}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            <tr>
              <th>수용 가능 인원 수</th>
              <td>최대 {{ service.capacity }}명</td>
            </tr>

            <!-- 리소스의 커스텀 필드 -->
            <tr v-for="item in resourceCustomFieldValues">
              <th>{{ item.fieldName }}</th>
              <td>
                {{ item.values.length > 1 ? formatCustomFieldValues(item.values) : item.values[0] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 오른쪽 영역 : 사용자 예약 박스 -->
      <div class="reservation-box">
        <div
          v-if="service.category === 'RESERVATION' || service.category === 'SEAT'"
          class="form-group"
        >
          <label>날짜</label>
          <div class="relative" @click="toggleCalendar">
            <Input type="text" class="cursor-pointer" v-model="selectedDate" readonly />
            <div v-if="showCalendar" class="date-picker" @click.stop>
              <Calendar
                @select="selectDate"
                :disabledDates="disabledDates"
                :selectedDate="selectedDate"
              />
            </div>
          </div>
        </div>

        <div
          v-if="(service.category === 'RESERVATION' || service.category === 'SEAT') && times"
          class="form-group"
        >
          <label>시간</label>
          <div v-if="availableTimes.length" class="time-grid">
            <button
              v-for="(time, index) in availableTimes"
              :key="index"
              :disabled="isTimeClosed(time.startTime) || isTimeHeld(time.startTime)"
              :class="[
                'time-btn',
                {
                  active: selectedTime === time.startTime,
                  block: isTimeClosed(time.startTime),
                  held: isTimeHeld(time.startTime),
                },
              ]"
              @click="handleTimeSelect(time.startTime)"
            >
              {{ time.startTime }}
            </button>
          </div>
          <div v-else class="text-gray-400 text-sm">해당 날짜는 운영 시간이 없습니다.</div>
        </div>

        <div v-if="service.category !== 'SEAT'" class="form-group">
          <label>인원수</label>
          <div class="people-control">
            <button class="count-btn" @click="decrease">−</button>
            <span class="count">{{ selectedHeadCount }}명</span>
            <button class="count-btn" @click="increase">＋</button>
          </div>
        </div>

        <div v-if="service.category === 'SEAT' && availableTimes.length" class="form-group">
          <label>좌석 선택</label>
          <div class="flex flex-row justify-between items-center gap-3">
            <span class="text-sm text-gray-500">
              {{
                selectedRow && selectedCol ? selectedRow + '행 ' + selectedCol + '열' : '선택 안됨'
              }}
            </span>
            <button
              type="button"
              @click="selectedTime ? (showSeatModal = true) : alert('시간을 먼저 선택해주세요.')"
              :disabled="!selectedTime"
              :class="[
                'px-4 py-2 text-sm rounded-md transition',
                selectedTime
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              ]"
            >
              좌석 선택
            </button>
          </div>
        </div>

        <!-- 사용자 커스텀 필드 -->
        <div v-for="(item, index) in userCustomFields" :key="item.id">
          <div class="form-group">
            <label>{{ item.fieldName }}</label>
            <div>
              <Input
                v-if="item.dataType === 'TEXT'"
                type="text"
                placeholder="텍스트를 입력해주세요."
                v-model="userCustomFieldValuesForm[index].values[0]"
              />
              <Input
                v-else-if="item.dataType === 'DATE'"
                type="date"
                v-model="userCustomFieldValuesForm[index].values[0]"
              />
              <Input
                v-else-if="item.dataType === 'TIME'"
                type="time"
                v-model="userCustomFieldValuesForm[index].values[0]"
              />
              <Input
                v-else-if="item.dataType === 'NUMBER'"
                type="number"
                placeholder="숫자를 입력해주세요."
                v-model="userCustomFieldValuesForm[index].values[0]"
              />
              <div v-else-if="item.dataType === 'RADIO'" class="desc">
                <!-- options 있을 때 -->
                <template v-if="item.options && item.options.length > 0">
                  <Input
                    v-for="option in item.options"
                    :key="option"
                    type="radio"
                    :label="option"
                    :value="option"
                    :name="'radio-' + item.id"
                    v-model="userCustomFieldValuesForm[index].values[0]"
                  />
                </template>
                <!-- options 없을 때 -->
                <template v-else>
                  <Input
                    type="radio"
                    label="예"
                    value="true"
                    :name="'radio-' + item.id"
                    v-model="userCustomFieldValuesForm[index].values[0]"
                  />
                  <Input
                    type="radio"
                    label="아니오"
                    value="false"
                    :name="'radio-' + item.id"
                    v-model="userCustomFieldValuesForm[index].values[0]"
                  />
                </template>
              </div>
              <div v-else-if="item.dataType === 'CHECKBOX'">
                <!-- options 있을 때 -->
                <template v-if="item.options && item.options.length > 0">
                  <Input
                    v-for="option in item.options"
                    :key="option"
                    type="checkbox"
                    :label="option"
                    :value="option"
                    :checked="userCustomFieldValuesForm[index].values.includes(option)"
                    @update:modelValue="(checked) => onCheckboxChange(index, option, checked)"
                  />
                </template>
                <!-- options 없을 때 -->
                <template v-else>
                  <Input
                    type="checkbox"
                    :label="item.fieldName"
                    :checked="userCustomFieldValuesForm[index].values[0] === true"
                    @update:modelValue="
                      (checked) => (userCustomFieldValuesForm[index].values = [checked])
                    "
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <Button @click="reserve()">예약하기</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  @apply bg-white min-h-screen flex flex-col items-center;
}

.header-image {
  @apply w-full h-64 sm:h-80 object-cover;
}

.content-wrapper {
  @apply flex flex-col lg:flex-row justify-between max-w-6xl w-full my-8 sm:my-10 gap-8 sm:gap-10 px-4 sm:px-10;
}

/* 왼쪽 정보 영역 */
.info-section {
  @apply text-text flex flex-col w-full lg:w-1/2;
}

.title {
  @apply text-base sm:text-xl font-semibold mb-3 sm:mb-4;
}

.desc {
  @apply text-sm sm:text-base text-gray-dark mb-6 leading-relaxed;
}

/* 테이블 */
.details-table {
  @apply text-sm sm:text-base text-text border-collapse w-full mt-8 sm:mt-14;
  border-collapse: separate;
  border-spacing: 0 1rem; /* 1rem = 16px */
}

.details-table th {
  @apply font-semibold text-left align-top pr-3 sm:pr-4;
  white-space: nowrap;
  width: 7.5rem;
}

.details-table td {
  @apply text-gray-dark;
}

.details-table,
.details-table th,
.details-table td {
  border: none;
}

/* 오른쪽 예약 영역 */
.reservation-box {
  @apply w-full lg:w-1/3 border border-gray-200 rounded-xl shadow-md p-5 sm:shadow-md p-6 flex flex-col gap-6 bg-white;
  position: sticky; /* 스크롤 시 고정 */
  top: 80px; /* 상단에서 떨어진 거리 */
  max-height: 500px; /* 고정 높이 설정 */
  overflow-y: auto; /* 내부 스크롤 가능 */
  /* position: relative; */
}

.form-group label {
  @apply block text-sm font-semibold mb-2 text-gray-700;
}

/* 날짜 */
.date-picker {
  @apply fixed z-50 mt-2 left-[50%] translate-x-[-33%] translate-y-[-45%] scale-75 origin-top-left;
}
/* .date-picker {
  @apply absolute z-50 top-0 right-full mr-4 bg-white rounded-lg shadow-lg border border-gray-200 p-2;
} */

/* 시간 */
.time-grid {
  @apply grid grid-cols-3 sm:grid-cols-4 gap-2;
}

.time-btn {
  @apply border border-gray-300 rounded-md py-2 text-sm text-gray-700 hover:bg-blue-50 transition;
}

.time-btn.active {
  @apply bg-blue-600 text-white border-blue-600;
}

.time-btn.block {
  @apply opacity-50 cursor-not-allowed bg-gray-200 text-gray-500 border-gray-300;
}

.time-btn.held {
  @apply opacity-50 cursor-not-allowed bg-yellow-100 text-yellow-700 border-yellow-300;
}

/* 인원수 */
.people-control {
  @apply flex items-center justify-between w-2/3 sm:w-1/2;
}

.count-btn {
  @apply bg-gray-100 w-8 h-8 sm:w-9 sm:h-9 rounded-full text-lg font-bold flex items-center justify-center hover:bg-blue-100 transition;
}

.count {
  @apply text-base font-medium;
}

/* 운영 시간 테이블 */
.inner-table {
  width: 100%;
  border-collapse: collapse;
}

.inner-table td {
  padding: 2px 4px;
  vertical-align: top;
}

.inner-table .font-semibold {
  white-space: nowrap;
  width: 2rem; /* 요일 칸 좁게 */
}
</style>
