<script setup>
import { ref, computed, watch } from 'vue'
import Dropdown from '@/components/Dropdown.vue'
import Button from '@/components/Button.vue'
import Modal from '@/components/Modal.vue'

const props = defineProps({
  interval: Number,
  category: { type: String, default: 'RESERVATION' },
})

const days = ['월', '화', '수', '목', '금', '토', '일']
const dayOrder = ['월', '화', '수', '목', '금', '토', '일']

// 상태
const selectedDays = ref([])
const startHour = ref('')
const startMinute = ref('')
const endHour = ref('')
const endMinute = ref('')
const timeSlots = ref([])
const editingIndex = ref(null)
const selectedTimes = ref([])

// 모달 상태
const settingModalOpen = ref(false) // 요일/시간 설정 모달
const excludeModalOpen = ref(false) // 제외 시간 선택 모달 (예약형)

// 드롭다운 옵션
const hourOptions = Array.from({ length: 24 }, (_, i) => ({
  label: String(i).padStart(2, '0'),
  value: String(i).padStart(2, '0'),
}))

const minuteOptions = computed(() => {
  if (props.category === 'SEAT') {
    const options = []
    for (let i = 0; i < 60; i += 5) {
      options.push({
        label: String(i).padStart(2, '0'),
        value: String(i).padStart(2, '0'),
      })
    }
    return options
  }
  return props.interval === 60
    ? [{ label: '00', value: '00' }]
    : [
        { label: '00', value: '00' },
        { label: '30', value: '30' },
      ]
})

// 요일 맵핑
const dayMap = { 월: 'MON', 화: 'TUE', 수: 'WED', 목: 'THU', 금: 'FRI', 토: 'SAT', 일: 'SUN' }

// 시간 유틸
function toMinutes(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number)
  return h * 60 + m
}

function toHHMM(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 모달 내 시간 목록 (예약형 제외 시간 선택용)
const modalTimes = computed(() => {
  if (!startHour.value || !startMinute.value || !endHour.value || !endMinute.value) return []
  const startMin = Number(startHour.value) * 60 + Number(startMinute.value)
  const endMin = Number(endHour.value) * 60 + Number(endMinute.value)
  const times = []
  for (let t = startMin; t < endMin; t += props.interval) {
    const h = Math.floor(t / 60)
    const m = t % 60
    times.push({ label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, value: t })
  }
  return times
})

// 모달 시간 변경 시 전체 선택
watch(modalTimes, (newTimes) => {
  if (newTimes.length && editingIndex.value === null) {
    selectedTimes.value = newTimes.map((t) => t.label)
  }
})

// 요일 토글
const toggleDay = (day) => {
  const idx = selectedDays.value.indexOf(day)
  if (idx >= 0) selectedDays.value.splice(idx, 1)
  else selectedDays.value.push(day)
}

// 설정 모달 열기 (신규)
const openSettingModal = () => {
  editingIndex.value = null
  selectedDays.value = []
  startHour.value = ''
  startMinute.value = ''
  endHour.value = ''
  endMinute.value = ''
  selectedTimes.value = []
  settingModalOpen.value = true
}

// 설정 모달 닫기
const closeSettingModal = () => {
  settingModalOpen.value = false
  editingIndex.value = null
}

// 제외 시간 모달 닫기
const closeExcludeModal = () => {
  excludeModalOpen.value = false
}

// 설정 모달에서 확인 클릭
const confirmSetting = () => {
  if (!startHour.value || !startMinute.value || !endHour.value || !endMinute.value) {
    alert('시작/종료 시간을 선택해주세요.')
    return
  }
  if (!selectedDays.value.length) {
    alert('요일을 선택해주세요.')
    return
  }

  // 시작 시간이 종료 시간보다 크거나 같으면 에러
  const startMin = Number(startHour.value) * 60 + Number(startMinute.value)
  const endMin = Number(endHour.value) * 60 + Number(endMinute.value)
  if (startMin >= endMin) {
    alert('종료 시간은 시작 시간보다 커야 합니다.')
    return
  }

  // 좌석형: 바로 추가
  if (props.category === 'SEAT') {
    addSlotDirect()
    closeSettingModal()
    return
  }

  // 예약형: 제외 시간 선택 모달 열기
  settingModalOpen.value = false
  excludeModalOpen.value = true
}

// 시간 토글 (제외 시간 선택)
const toggleSelectedTime = (timeLabel) => {
  const idx = selectedTimes.value.indexOf(timeLabel)
  if (idx >= 0) selectedTimes.value.splice(idx, 1)
  else selectedTimes.value.push(timeLabel)
}

// 슬롯 추가 (예약형)
const addSlot = () => {
  if (!selectedTimes.value.length) {
    alert('시간을 하나 이상 선택하세요')
    return
  }

  selectedTimes.value.sort((a, b) => toMinutes(a) - toMinutes(b))

  const sortedDays = [...selectedDays.value].sort(
    (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b),
  )

  const lastTime = selectedTimes.value[selectedTimes.value.length - 1]
  const endTime = toHHMM(toMinutes(lastTime) + props.interval)

  const newSlot = {
    days: sortedDays,
    start: selectedTimes.value[0],
    end: endTime,
    selectedTimes: [...selectedTimes.value],
  }

  if (editingIndex.value !== null) {
    timeSlots.value[editingIndex.value] = newSlot
  } else {
    timeSlots.value.push(newSlot)
  }

  closeExcludeModal()
  editingIndex.value = null
}

// 슬롯 추가 (좌석형)
const addSlotDirect = () => {
  const start = `${startHour.value}:${startMinute.value}`
  const end = `${endHour.value}:${endMinute.value}`

  const sortedDays = [...selectedDays.value].sort(
    (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b),
  )

  const newSlot = {
    days: sortedDays,
    start,
    end,
    selectedTimes: [start],
  }

  if (editingIndex.value !== null) {
    timeSlots.value[editingIndex.value] = newSlot
  } else {
    timeSlots.value.push(newSlot)
  }

  editingIndex.value = null
}

// 슬롯 삭제
const removeSlot = (idx) => {
  timeSlots.value.splice(idx, 1)
}

// 슬롯 수정
const editSlot = (slot, idx) => {
  editingIndex.value = idx
  selectedDays.value = [...slot.days]
  startHour.value = slot.start.split(':')[0]
  startMinute.value = slot.start.split(':')[1]
  endHour.value = slot.end.split(':')[0]
  endMinute.value = slot.end.split(':')[1]
  selectedTimes.value = [...slot.selectedTimes]
  settingModalOpen.value = true
}

// 전체 리셋
const resetAll = () => {
  selectedDays.value = []
  startHour.value = ''
  startMinute.value = ''
  endHour.value = ''
  endMinute.value = ''
  selectedTimes.value = []
  timeSlots.value = []
  editingIndex.value = null
}

// expose
defineExpose({
  resetAll,
  getTimeSlots: () => {
    const result = []

    timeSlots.value.forEach((slot) => {
      if (props.category === 'SEAT') {
        result.push({
          days: slot.days.map((d) => dayMap[d] || d),
          startTime: slot.start,
          endTime: slot.end,
        })
        return
      }

      const interval = Number(props.interval || 60)
      const includedArr = Array.isArray(slot.selectedTimes) ? [...slot.selectedTimes].sort() : []

      if (!includedArr.length) return

      const startTimesInMin = includedArr.map(toMinutes)

      let blockStart = startTimesInMin[0]
      let prev = startTimesInMin[0]

      for (let i = 1; i <= startTimesInMin.length; i++) {
        const cur = startTimesInMin[i]
        const isContiguous = cur === prev + interval

        if (!isContiguous) {
          result.push({
            days: slot.days.map((d) => dayMap[d] || d),
            startTime: toHHMM(blockStart),
            endTime: toHHMM(prev + interval),
          })

          if (cur) {
            blockStart = cur
            prev = cur
          }
        } else {
          prev = cur
        }
      }
    })

    return result
  },
  setTimeSlots: (slots) => {
    timeSlots.value = slots
  },
})
</script>

<template>
  <div class="time-slot-modal-container">
    <!-- 일정 추가 버튼 -->
    <Button @click="openSettingModal" theme="primary" size="sm"> + 일정 추가 </Button>

    <!-- 추가된 시간대 목록 -->
    <div v-if="timeSlots.length" class="slot-list-container">
      <div v-for="(slot, idx) in timeSlots" :key="idx" class="slot-item">
        <span>{{ slot.days.join(', ') }} | {{ slot.start }} ~ {{ slot.end }}</span>
        <div class="slot-item-buttons">
          <button @click="editSlot(slot, idx)" class="edit-btn">수정</button>
          <button @click="removeSlot(idx)" class="delete-btn">삭제</button>
        </div>
      </div>
    </div>

    <!-- 요일/시간 설정 모달 -->
    <Modal :open="settingModalOpen" @close="closeSettingModal">
      <div class="setting-modal-content">
        <h2 class="modal-title">{{ editingIndex !== null ? '일정 수정' : '일정 추가' }}</h2>

        <!-- 요일 선택 -->
        <div class="form-group">
          <label>요일 선택</label>
          <div class="day-select-container">
            <button
              v-for="day in days"
              :key="day"
              @click="toggleDay(day)"
              :class="[
                'day-button',
                selectedDays.includes(day) ? 'day-button-active' : 'day-button-inactive',
              ]"
            >
              {{ day }}
            </button>
          </div>
        </div>

        <!-- 시간 선택 -->
        <div class="form-group">
          <label>시간 설정</label>
          <div class="time-select-container">
            <div class="time-select-group">
              <Dropdown v-model="startHour" :options="hourOptions" placeholder="시" width="w-20" />
              <Dropdown
                v-model="startMinute"
                :options="minuteOptions"
                placeholder="분"
                width="w-20"
              />
            </div>
            <span class="time-separator">~</span>
            <div class="time-select-group">
              <Dropdown v-model="endHour" :options="hourOptions" placeholder="시" width="w-20" />
              <Dropdown
                v-model="endMinute"
                :options="minuteOptions"
                placeholder="분"
                width="w-20"
              />
            </div>
          </div>
        </div>

        <!-- 버튼 -->
        <div class="modal-buttons">
          <Button @click="closeSettingModal" theme="gray" size="sm">취소</Button>
          <Button @click="confirmSetting" size="sm">
            {{ category === 'SEAT' ? (editingIndex !== null ? '수정' : '추가') : '다음' }}
          </Button>
        </div>
      </div>
    </Modal>

    <!-- 제외 시간 선택 모달 (예약형만) -->
    <Modal :open="excludeModalOpen" @close="closeExcludeModal">
      <div class="exclude-modal-content">
        <h2 class="modal-title">{{ editingIndex !== null ? '시간 수정' : '시간 선택' }}</h2>
        <p class="modal-desc">제외할 시간을 클릭하여 해제하세요.</p>

        <div class="time-grid">
          <button
            v-for="time in modalTimes"
            :key="time.label"
            @click="toggleSelectedTime(time.label)"
            :class="[
              'time-button',
              selectedTimes.includes(time.label) ? 'time-button-active' : 'time-button-inactive',
            ]"
          >
            {{ time.label }}
          </button>
        </div>

        <div class="modal-buttons">
          <Button @click="closeExcludeModal" theme="gray" size="sm">취소</Button>
          <Button @click="addSlot" size="sm">
            {{ editingIndex !== null ? '수정' : '추가' }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.time-slot-modal-container {
  @apply mt-[15px];
}

/* 슬롯 목록 */
.slot-list-container {
  @apply mt-[20px] flex flex-col gap-2 w-full max-w-[700px];
}

.slot-item {
  @apply bg-white flex justify-between items-center py-[10px] px-[16px] rounded-[3px] text-[14px];
}

.slot-item-buttons {
  @apply flex gap-3 text-[13px];
}

.edit-btn {
  @apply text-primary cursor-pointer hover:text-primary-hover;
}

.delete-btn {
  @apply text-red-600 cursor-pointer hover:text-red-800;
}

/* 설정 모달 */
.setting-modal-content {
  @apply p-6 min-w-[400px];
}

.modal-title {
  @apply text-[18px] font-bold text-text mb-[20px];
}

.form-group {
  @apply mb-[20px];
}

.form-group label {
  @apply block text-[14px] font-medium text-text mb-[8px];
}

/* 요일 선택 */
.day-select-container {
  @apply flex gap-2;
}

.day-button {
  @apply w-[38px] h-[38px] rounded-full text-[14px] transition-all;
}

.day-button-active {
  @apply bg-primary text-white;
}

.day-button-inactive {
  @apply bg-gray-deep text-text hover:bg-gray-300;
}

/* 시간 선택 */
.time-select-container {
  @apply flex items-center gap-3;
}

.time-select-group {
  @apply flex gap-1;
}

.time-separator {
  @apply text-[16px] text-gray-dark;
}

/* 제외 시간 모달 */
.exclude-modal-content {
  @apply p-6 min-w-[350px] max-h-[80vh] overflow-y-auto;
}

.modal-desc {
  @apply text-[13px] text-gray-dark mb-[20px];
}

.time-grid {
  @apply flex flex-wrap gap-2;
}

.time-button {
  @apply px-3 py-2 rounded text-[14px] transition-all cursor-pointer;
}

.time-button-active {
  @apply bg-primary text-white;
}

.time-button-inactive {
  @apply bg-gray-200 text-gray-dark;
}

/* 모달 버튼 */
.modal-buttons {
  @apply flex justify-end gap-2 mt-[30px];
}
</style>
