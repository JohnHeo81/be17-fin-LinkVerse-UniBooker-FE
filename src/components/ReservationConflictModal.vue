<script setup>
  import { ref } from 'vue'
  import Button from '@/components/Button.vue'
  
  const props = defineProps({
    isOpen: { type: Boolean, default: false },
    reservationCount: { type: Number, default: 0 },
  })
  
  const emit = defineEmits(['close', 'confirm'])
  
  const selectedAction = ref('CANCEL')
  
  const actionOptions = [
    { value: 'CANCEL', label: '예약 취소', description: '기존 예약을 모두 취소하고 사용자에게 알림을 발송합니다.' },
    { value: 'KEEP', label: '예약 유지', description: '기존 예약은 그대로 유지하고 시간 설정만 변경합니다.' },
  ]
  
  const handleConfirm = () => {
    emit('confirm', selectedAction.value)
  }
  
  const handleClose = () => {
    emit('close')
  }
  </script>
  
  <template>
    <div v-if="isOpen" class="modal-overlay">
      <div class="modal-container">
        <!-- 헤더 -->
        <div class="modal-header">
          <h2>예약 충돌 확인</h2>
          <button @click="handleClose" class="close-button">✕</button>
        </div>
  
        <!-- 본문 -->
        <div class="modal-body">
          <div class="warning-box">
            <span class="warning-icon">⚠️</span>
            <p>
              현재 <strong>{{ reservationCount }}건</strong>의 예약이 존재합니다.<br />
              시간 설정을 변경하면 기존 예약에 영향을 줄 수 있습니다.
            </p>
          </div>
  
          <div class="action-options">
            <label
              v-for="option in actionOptions"
              :key="option.value"
              class="action-option"
              :class="{ selected: selectedAction === option.value }"
            >
              <input
                type="radio"
                :value="option.value"
                v-model="selectedAction"
                class="radio-input"
              />
              <div class="option-content">
                <span class="option-label">{{ option.label }}</span>
                <p class="option-description">{{ option.description }}</p>
              </div>
            </label>
          </div>
        </div>
  
        <!-- 푸터 -->
        <div class="modal-footer">
          <Button theme="gray" @click="handleClose">취소</Button>
          <Button @click="handleConfirm">확인</Button>
        </div>
      </div>
    </div>
  </template>
  
  <style scoped>
  .modal-overlay {
    @apply fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50;
  }
  
  .modal-container {
    @apply bg-white rounded-lg w-[480px] max-h-[90vh] overflow-y-auto;
  }
  
  .modal-header {
    @apply flex justify-between items-center px-6 py-4 border-b border-gray-line;
  }
  
  .modal-header h2 {
    @apply text-lg font-bold text-text;
  }
  
  .close-button {
    @apply text-gray-400 hover:text-gray-600 text-xl cursor-pointer;
  }
  
  .modal-body {
    @apply px-6 py-5;
  }
  
  .warning-box {
    @apply flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-5;
  }
  
  .warning-icon {
    @apply text-2xl;
  }
  
  .warning-box p {
    @apply text-sm text-gray-700 leading-relaxed;
  }
  
  .warning-box strong {
    @apply text-red-600 font-semibold;
  }
  
  .action-options {
    @apply flex flex-col gap-3;
  }
  
  .action-option {
    @apply flex items-start gap-3 p-4 border border-gray-line rounded-lg cursor-pointer transition-all;
  }
  
  .action-option:hover {
    @apply border-primary bg-blue-50;
  }
  
  .action-option.selected {
    @apply border-primary bg-blue-50;
  }
  
  .radio-input {
    @apply mt-1 cursor-pointer;
  }
  
  .option-content {
    @apply flex flex-col;
  }
  
  .option-label {
    @apply font-medium text-text;
  }
  
  .option-description {
    @apply text-xs text-gray-500 mt-1;
  }
  
  .modal-footer {
    @apply flex justify-end gap-2 px-6 py-4 border-t border-gray-line;
  }
  
  .modal-footer button {
    @apply px-5 text-sm;
  }
  </style>