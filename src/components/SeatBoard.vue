<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  service: Object,
  selectedTime: String,
  resourceReservations: Array,
  holdList: Array,
  currentHold: Object, // 본인 Hold 정보 추가
})
const emits = defineEmits(['selectSeat'])

const route = useRoute()

// 행, 열 정보
const rows = props.service.row
const cols = props.service.col

// 좌석 데이터
const seats = ref([])

// 선택한 좌석
const selectedSeat = ref(null)

// 호버된 좌석
const hoverSeat = ref(null)

// 🌟 현재 선택한 시간대에 해당하는 예약 정보만 필터링
const currentTimeReservations = computed(() => {
  if (!props.selectedTime || !props.resourceReservations) return []
  return props.resourceReservations.filter((r) => r.startDate.slice(11, 16) === props.selectedTime)
})

// 🌟 현재 선택한 시간대에 해당하는 Hold 정보만 필터링
const currentTimeHolds = computed(() => {
  if (!props.selectedTime || !props.holdList) return []
  return props.holdList.filter((h) => h.time === props.selectedTime)
})

// 좌석이 Hold 되어있는지 확인
const isSeatHeld = (row, col) => {
  return currentTimeHolds.value.some((h) => h.row === row && h.col === col)
}

// 좌석 데이터 생성
const generateSeats = () => {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const rowNum = r + 1
      const colNum = c + 1

      // 선택된 시간과 일치하는 예약만 필터링
      const reservedSeat = currentTimeReservations.value.find(
        (item) => item.row === rowNum && item.col === colNum,
      )

      // Hold 여부 확인
      const isHeld = isSeatHeld(rowNum, colNum)

      // 본인 Hold 여부 확인
      const isMyHold =
        props.currentHold &&
        props.currentHold.time === props.selectedTime &&
        props.currentHold.row === rowNum &&
        props.currentHold.col === colNum

      return {
        id: route.params.itemId * 10000 + r * cols + c,
        row: rowNum,
        col: colNum,
        reserved: !!reservedSeat,
        held: isHeld,
        myHold: isMyHold, // 본인 Hold 여부 추가
        reservationInfo: reservedSeat
          ? {
              id: reservedSeat.id,
              name: reservedSeat.userName,
              date: reservedSeat.startDate,
              time: reservedSeat.endDate,
            }
          : null,
      }
    }),
  )
}

// 좌석 호버시 처리
const onSeatHoverBoard = (seat) => {
  hoverSeat.value = seat
}

// 좌석 선택 시 부모 컴포넌트에 값 전달
const sendParentSeatInfo = (seat) => {
  // 예약된 좌석은 선택 불가
  if (seat.reserved) {
    return
  }
  // Hold된 좌석은 선택 불가 (부모에서 처리하지만 UI에서도 막기)
  if (seat.held) {
    return
  }

  // selectedSeat.value = seat 삭제 (Hold 생성 후 WebSocket으로 색상 반영)
  emits('selectSeat', seat)
}

// 화면 로드시 실행
onMounted(() => {
  seats.value = generateSeats()
  console.log('🌟props 값 확인 : ', props.selectedTime, props.resourceReservations)
})

// 선택된 시간, 예약목록, Hold목록이 바뀔때마다 좌석 재생성
watch(
  [
    () => props.selectedTime,
    () => props.resourceReservations,
    () => props.holdList,
    () => props.currentHold?.time,
    () => props.currentHold?.row,
    () => props.currentHold?.col,
  ],
  () => {
    seats.value = generateSeats()
  },
)
</script>

<template>
  <div class="p-6">
    <!-- 좌석판 -->
    <div class="seat-board">
      <h2 class="title">좌석</h2>

      <!-- 좌석 범례 -->
      <div class="legend">
        <div class="legend-seat empty"></div>
        <span class="legend-text">빈 좌석</span>
        <div class="legend-seat my-held"></div>
        <span class="legend-text">선택한 좌석</span>
        <div class="legend-seat other-held"></div>
        <span class="legend-text">선택 불가</span>
      </div>

      <!-- 실제 좌석 -->
      <div class="seat-grid">
        <div v-for="row in seats" :key="row[0].row" class="seat-row">
          <div
            v-for="seat in row"
            :key="seat.id"
            :class="[
              'seat',
              seat.reserved
                ? 'reserved'
                : seat.myHold
                  ? 'my-held'
                  : seat.held
                    ? 'other-held'
                    : 'empty',
              hoverSeat?.id === seat.id ? 'hovered' : '',
            ]"
            @mouseenter="onSeatHoverBoard(seat)"
            @mouseleave="hoverSeat = null"
            @click="sendParentSeatInfo(seat)"
          ></div>
        </div>
      </div>

      <!-- 좌석 정보 통합 영역 -->
      <div class="seat-info-area">
        <div class="seat-count">
          <span>총 좌석 {{ rows * cols }}</span>
          <span class="divider">|</span>
          <span
            >남은 좌석
            {{ rows * cols - currentTimeReservations.length - currentTimeHolds.length }}</span
          >
        </div>
        <div class="selected-seat">
          <!-- 선택된 좌석이 있으면 선택 정보, 없으면 호버 정보 -->
          <span v-if="props.currentHold?.row && props.currentHold?.col">
            선택 좌석: {{ props.currentHold.row }}행 {{ props.currentHold.col }}열
          </span>
          <span v-else-if="hoverSeat"> 좌석 {{ hoverSeat.row }}행 {{ hoverSeat.col }}열 </span>
          <span v-else class="text-gray-400"> 좌석을 선택해주세요 </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title {
  @apply font-semibold mb-2;
}

.seat-board {
  @apply relative p-4 overflow-visible;
}

.legend {
  @apply flex gap-4 mb-2 items-center;
}

.legend-seat {
  @apply w-4 h-4 rounded-sm border;
}

.legend-seat.empty {
  @apply bg-primary;
}

.legend-seat.my-held {
  @apply bg-yellow-300;
}

.legend-seat.other-held {
  @apply bg-gray-300;
}

.legend-text {
  @apply text-sm text-gray-700;
}

.seat-grid {
  @apply inline-block;
  width: calc(12 * 1.5rem + 11px);
}

.seat-row {
  @apply flex gap-1 mb-1;
}

.seat {
  @apply w-6 h-6 rounded-sm cursor-pointer border relative transition;
}

.seat.empty {
  @apply bg-primary;
}

.seat.my-held {
  @apply bg-yellow-300;
}

.seat.other-held {
  @apply bg-gray-300 cursor-not-allowed;
}

.seat.reserved {
  @apply bg-gray-300 cursor-not-allowed;
}

.seat.hovered {
  @apply ring-2 ring-blue-400;
}

/* 좌석 정보 통합 영역 */
.seat-info-area {
  @apply mt-4 flex justify-between items-center text-sm;
}

.seat-count {
  @apply text-gray-500;
}

.seat-count .divider {
  @apply mx-2 text-gray-300;
}

.selected-seat {
  @apply font-medium text-gray-700;
}
</style>
