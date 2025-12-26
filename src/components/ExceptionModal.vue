<script setup>
  import { ref, computed, watch } from 'vue'
  import Dropdown from '@/components/Dropdown.vue'
  import Button from '@/components/Button.vue'
  import Modal from '@/components/Modal.vue'
  
  const props = defineProps({
    interval: Number,
    modelValue: { type: Array, default: () => [] },
    excludedTimes: { type: Array, default: () => [] },
    category: { type: String, default: 'RESERVATION' },
  })
  
  const emit = defineEmits(['update:modelValue', 'close'])
  
  // 모달 상태
  const settingModalOpen = ref(false)
  const excludeModalOpen = ref(false)
  const editingIndex = ref(null)
  
  // 입력 상태
  const date = ref('')
  const closed = ref(false)
  const startHour = ref('')
  const startMinute = ref('')
  const endHour = ref('')
  const endMinute = ref('')
  const selectedTimes = ref([])
  const note = ref('')
  
  // 시간 옵션
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
  
  const modalTimes = ref([])
  
  const updateModalTimes = () => {
    if (!startHour.value || !startMinute.value || !endHour.value || !endMinute.value) {
      modalTimes.value = []
      return
    }
  
    const startMin = Number(startHour.value) * 60 + Number(startMinute.value)
    const endMin = Number(endHour.value) * 60 + Number(endMinute.value)
    const times = []
  
    for (let t = startMin; t < endMin; t += props.interval) {
      const h = Math.floor(t / 60)
      const m = t % 60
      times.push({ label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, value: t })
    }
  
    modalTimes.value = times
  }
  
  watch([startHour, startMinute, endHour, endMinute], updateModalTimes)
  
  // 시간 유틸
  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  
  const toHHMM = (min) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  
  // 서버에서 받아온 excludedTimes 처리
  watch(
    () => props.excludedTimes,
    (newVal) => {
      if (!newVal || !newVal.length) return
  
      const grouped = {}
  
      newVal.forEach((ex) => {
        if (!grouped[ex.date]) grouped[ex.date] = []
        if (!ex.closed) {
          grouped[ex.date].push({
            start: ex.startTime,
            end: ex.endTime,
          })
        } else {
          grouped[ex.date].push({
            closed: true,
            note: ex.note || '',
          })
        }
      })
  
      const result = []
  
      Object.entries(grouped).forEach(([date, items]) => {
        const closedItem = items.find((i) => i.closed)
        if (closedItem) {
          result.push({
            date,
            closed: true,
            note: closedItem.note,
            selectedTimes: [],
          })
        } else {
          let allTimes = []
          items.forEach(({ start, end }) => {
            const startMin = toMinutes(start)
            const endMin = toMinutes(end)
            for (let t = startMin; t < endMin; t += props.interval) {
              allTimes.push(t)
            }
          })
  
          allTimes = Array.from(new Set(allTimes)).sort((a, b) => a - b)
  
          result.push({
            date,
            closed: false,
            note: '',
            startTime: toHHMM(allTimes[0]),
            endTime: toHHMM(allTimes[allTimes.length - 1] + props.interval),
            selectedTimes: allTimes.map(toHHMM),
          })
        }
      })
  
      emit('update:modelValue', result)
    },
    { immediate: true },
  )
  
  // 설정 모달 열기 (신규)
  const openSettingModal = () => {
    editingIndex.value = null
    date.value = ''
    closed.value = false
    startHour.value = ''
    startMinute.value = ''
    endHour.value = ''
    endMinute.value = ''
    selectedTimes.value = []
    note.value = ''
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
    if (!date.value) {
      alert('날짜를 선택해주세요.')
      return
    }
  
    // 휴무일이면 바로 추가
    if (closed.value) {
      addExceptionDirect()
      closeSettingModal()
      return
    }
  
    if (!startHour.value || !startMinute.value || !endHour.value || !endMinute.value) {
      alert('시작/종료 시간을 선택해주세요.')
      return
    }
  
    const startMin = Number(startHour.value) * 60 + Number(startMinute.value)
    const endMin = Number(endHour.value) * 60 + Number(endMinute.value)
    if (startMin >= endMin) {
      alert('종료 시간은 시작 시간보다 커야 합니다.')
      return
    }
  
    // 좌석형: 바로 추가
    if (props.category === 'SEAT') {
      addExceptionDirect()
      closeSettingModal()
      return
    }
  
    // 예약형: 제외 시간 선택 모달 열기
    updateModalTimes()
    if (editingIndex.value === null) {
      selectedTimes.value = modalTimes.value.map((t) => t.label)
    }
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
  const addException = () => {
    if (!selectedTimes.value.length) {
      alert('시간을 하나 이상 선택하세요')
      return
    }
  
    selectedTimes.value.sort((a, b) => toMinutes(a) - toMinutes(b))
  
    const newItem = {
      date: date.value,
      startTime: selectedTimes.value[0],
      endTime: toHHMM(toMinutes(selectedTimes.value[selectedTimes.value.length - 1]) + props.interval),
      note: note.value,
      closed: false,
      selectedTimes: [...selectedTimes.value],
    }
  
    if (editingIndex.value !== null) {
      props.modelValue[editingIndex.value] = newItem
    } else {
      props.modelValue.push(newItem)
    }
  
    emit('update:modelValue', [...props.modelValue])
    closeExcludeModal()
    editingIndex.value = null
  }
  
  // 슬롯 추가 (좌석형/휴무일)
  const addExceptionDirect = () => {
    const newItem = closed.value
      ? {
          date: date.value,
          note: note.value,
          closed: true,
          selectedTimes: [],
        }
      : {
          date: date.value,
          startTime: `${startHour.value}:${startMinute.value}`,
          endTime: `${endHour.value}:${endMinute.value}`,
          note: note.value,
          closed: false,
          selectedTimes: [`${startHour.value}:${startMinute.value}`],
        }
  
    if (editingIndex.value !== null) {
      props.modelValue[editingIndex.value] = newItem
    } else {
      props.modelValue.push(newItem)
    }
  
    emit('update:modelValue', [...props.modelValue])
    editingIndex.value = null
  }
  
  // 수정
  const editException = (ex, idx) => {
    editingIndex.value = idx
    date.value = ex.date
    closed.value = ex.closed
    note.value = ex.note || ''
  
    if (!ex.closed) {
      startHour.value = (ex.startTime || '').split(':')[0] || ''
      startMinute.value = (ex.startTime || '').split(':')[1] || ''
      endHour.value = (ex.endTime || '').split(':')[0] || ''
      endMinute.value = (ex.endTime || '').split(':')[1] || ''
  
      if (ex.selectedTimes?.length) {
        selectedTimes.value = [...ex.selectedTimes]
      }
    } else {
      startHour.value = ''
      startMinute.value = ''
      endHour.value = ''
      endMinute.value = ''
      selectedTimes.value = []
    }
  
    settingModalOpen.value = true
  }
  
  // 삭제
  const removeException = (idx) => {
    props.modelValue.splice(idx, 1)
    emit('update:modelValue', [...props.modelValue])
  }
  
  // 초기화
  const resetAll = () => {
    date.value = ''
    closed.value = false
    startHour.value = ''
    startMinute.value = ''
    endHour.value = ''
    endMinute.value = ''
    selectedTimes.value = []
    note.value = ''
    editingIndex.value = null
    settingModalOpen.value = false
    excludeModalOpen.value = false
    emit('update:modelValue', [])
  }
  
  defineExpose({
    resetAll,
    getExceptionSlots: () => {
      const slots = []
  
      props.modelValue.forEach((ex) => {
        if (ex.closed) {
          slots.push({
            date: ex.date,
            startTime: null,
            endTime: null,
            isClosed: true,
            note: ex.note || '',
          })
          return
        }
  
        if (props.category === 'SEAT') {
          slots.push({
            date: ex.date,
            startTime: ex.startTime,
            endTime: ex.endTime,
            isClosed: false,
            note: ex.note || '',
          })
          return
        }
  
        const selectedMins = (ex.selectedTimes || [])
          .map((t) => {
            const [h, m] = t.split(':').map(Number)
            return h * 60 + m
          })
          .sort((a, b) => a - b)
  
        if (!selectedMins.length) return
  
        let blockStart = selectedMins[0]
        let prev = selectedMins[0]
  
        for (let i = 1; i <= selectedMins.length; i++) {
          const curr = selectedMins[i]
  
          if (curr !== prev + props.interval) {
            slots.push({
              date: ex.date,
              startTime: toHHMM(blockStart),
              endTime: toHHMM(prev + props.interval),
              isClosed: false,
              note: ex.note || '',
            })
  
            blockStart = curr
          }
          prev = curr
        }
      })
  
      return slots
    },
  })
  </script>
  
  <template>
    <div class="exception-modal-container">
      <!-- 예외 추가 버튼 -->
      <Button @click="openSettingModal" theme="primary" size="sm">
        + 예외 추가
      </Button>
  
      <!-- 등록된 예외 일정 목록 -->
      <div v-if="props.modelValue.length" class="slot-list-container">
        <div v-for="(ex, idx) in props.modelValue" :key="idx" class="slot-item">
          <span>
            {{ ex.date }}
            <template v-if="ex.closed"> (휴무)</template>
            <template v-else> | {{ ex.startTime }} ~ {{ ex.endTime }}</template>
            <template v-if="ex.note"> - {{ ex.note }}</template>
          </span>
          <div class="slot-item-buttons">
            <button @click="editException(ex, idx)" class="edit-btn">수정</button>
            <button @click="removeException(idx)" class="delete-btn">삭제</button>
          </div>
        </div>
      </div>
  
      <!-- 설정 모달 -->
      <Modal :open="settingModalOpen" @close="closeSettingModal">
        <div class="setting-modal-content">
          <h2 class="modal-title">{{ editingIndex !== null ? '예외 일정 수정' : '예외 일정 추가' }}</h2>
  
          <!-- 날짜 선택 -->
          <div class="form-group">
            <label>날짜 선택</label>
            <div class="date-input-container">
              <input type="date" v-model="date" class="date-input" />
              <label class="checkbox-label">
                <input type="checkbox" v-model="closed" />
                <span>휴무일</span>
              </label>
            </div>
          </div>
  
          <!-- 시간 선택 (휴무일이 아닐 때만) -->
          <div v-if="!closed" class="form-group">
            <label>시간 설정</label>
            <div class="time-select-container">
              <div class="time-select-group">
                <Dropdown v-model="startHour" :options="hourOptions" placeholder="시" width="w-20" />
                <Dropdown v-model="startMinute" :options="minuteOptions" placeholder="분" width="w-20" />
              </div>
              <span class="time-separator">~</span>
              <div class="time-select-group">
                <Dropdown v-model="endHour" :options="hourOptions" placeholder="시" width="w-20" />
                <Dropdown v-model="endMinute" :options="minuteOptions" placeholder="분" width="w-20" />
              </div>
            </div>
          </div>
  
          <!-- 사유/비고 (휴무일일 때만) -->
          <div v-if="closed" class="form-group">
            <label>사유 / 비고</label>
            <input type="text" v-model="note" class="note-input" placeholder="예: 정기 휴무" />
          </div>
  
          <!-- 버튼 -->
          <div class="modal-buttons">
            <Button @click="closeSettingModal" theme="gray" size="sm">취소</Button>
            <Button @click="confirmSetting" size="sm">
              {{ closed || category === 'SEAT' ? (editingIndex !== null ? '수정' : '추가') : '다음' }}
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
  
          <!-- 사유/비고 -->
          <div class="form-group mt-6">
            <label>사유 / 비고</label>
            <input type="text" v-model="note" class="note-input" placeholder="예: 점심시간" />
          </div>
  
          <div class="modal-buttons">
            <Button @click="closeExcludeModal" theme="gray" size="sm">취소</Button>
            <Button @click="addException" size="sm">
              {{ editingIndex !== null ? '수정' : '추가' }}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  </template>
  
  <style scoped>
  .exception-modal-container {
    @apply mt-[15px] w-full;
  }
  
  /* 슬롯 목록 */
  .slot-list-container {
    @apply mt-[20px] flex flex-col gap-2 w-full;
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
  
  /* 날짜 입력 */
  .date-input-container {
    @apply flex gap-4 items-center;
  }
  
  .date-input {
    @apply px-3 py-2 rounded border border-gray-line text-[14px];
  }
  
  .checkbox-label {
    @apply flex items-center gap-2 text-[14px] cursor-pointer;
  }
  
  .checkbox-label input {
    @apply w-4 h-4;
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
  
  /* 비고 입력 */
  .note-input {
    @apply w-full px-3 py-2 rounded border border-gray-line text-[14px];
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