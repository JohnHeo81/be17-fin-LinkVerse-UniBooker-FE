<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/UseStore'
  import { connectWebSocket } from '@/utils/webSocket'
  import Button from '@/components/Button.vue'
  import Input from '@/components/Input.vue'
  import oauthApi from '@/services/user/oauth_api'
  import userApi from '@/services/user/user_api'
  
  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  
  const companyInfo = ref(null)
  const isLoading = ref(false)
  const tempToken = ref('')
  const email = ref('')
  
  onMounted(async () => {
    tempToken.value = route.query.token
  
    if (!tempToken.value) {
      alert('잘못된 접근입니다.')
      router.push(`/c/${route.params.companySlug}/`)
      return
    }
  
    await loadCompanyInfo()
  })
  
  /**
   * 기업 정보 로드
   */
  const loadCompanyInfo = async () => {
    const companySlug = route.params.companySlug
  
    try {
      const response = await userApi.getCompanyBySlug(companySlug)
      if (response.isSuccess && response.data) {
        companyInfo.value = response.data
      }
    } catch (error) {
      console.error('기업 정보 로드 실패:', error)
    }
  }
  
  /**
   * 이메일 유효성 검사
   */
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }
  
  /**
   * 이메일 제출
   */
  const handleSubmit = async () => {
    if (!email.value) {
      alert('이메일을 입력해주세요.')
      return
    }
  
    if (!isValidEmail(email.value)) {
      alert('올바른 이메일 형식을 입력해주세요.')
      return
    }
  
    isLoading.value = true
  
    try {
      const response = await oauthApi.submitEmail({
        token: tempToken.value,
        email: email.value,
      })
  
      if (response.isSuccess && response.data) {
        const result = response.data
  
        if (result.status === 'success') {
          // 기존 사용자 → 로그인 완료
          authStore.login(
            {
              userId: result.userId,
              name: result.name,
              email: result.email,
            },
            'USER',
            null,
            result.companySlug,
          )
  
          try {
            await connectWebSocket()
          } catch (wsError) {
            console.error('WebSocket 연결 실패:', wsError)
          }
  
          alert('로그인 성공!')
          router.push(`/c/${route.params.companySlug}/services`)
        } else if (result.status === 'new') {
          // 신규 사용자 → 약관 동의 페이지
          router.push({
            name: 'OAuthAgreement',
            params: { companySlug: route.params.companySlug },
            query: { token: result.token },
          })
        }
      } else {
        alert(response.message || '처리에 실패했습니다.')
      }
    } catch (error) {
      console.error('이메일 제출 실패:', error)
  
      const errorCode = error.response?.data?.code
  
      if (errorCode === 50023) {
        alert('인증이 만료되었습니다. 다시 시도해주세요.')
        router.push(`/c/${route.params.companySlug}/`)
      } else {
        alert(error.response?.data?.message || '처리에 실패했습니다.')
      }
    } finally {
      isLoading.value = false
    }
  }
  
  /**
   * 취소
   */
  const handleCancel = () => {
    router.push(`/c/${route.params.companySlug}/`)
  }
  </script>
  
  <template>
    <div class="oauth-email-page">
      <main class="oauth-email-main">
        <!-- 환영 메시지 -->
        <div v-if="companyInfo" class="oauth-email-welcome">
          <span class="oauth-email-welcome-highlight">{{ companyInfo.companyName }}</span>
          <span class="oauth-email-welcome-text">서비스 가입</span>
        </div>
  
        <!-- 이메일 입력 카드 -->
        <div class="oauth-email-card">
          <h2 class="oauth-email-title">이메일 입력</h2>
          <p class="oauth-email-description">
            카카오 계정에서 이메일 정보를 제공받지 못했습니다.<br />
            서비스 이용을 위해 이메일을 입력해주세요.
          </p>
  
          <div class="oauth-email-field">
            <label for="email" class="oauth-email-label">이메일</label>
            <Input
              id="email"
              v-model="email"
              type="email"
              placeholder="example@email.com"
              class="oauth-email-input"
            />
          </div>
  
          <div class="oauth-email-buttons">
            <Button
              @click="handleSubmit"
              :disabled="!email || isLoading"
              class="oauth-email-submit-button"
            >
              {{ isLoading ? '처리 중...' : '다음' }}
            </Button>
            <Button @click="handleCancel" class="oauth-email-cancel-button">
              취소
            </Button>
          </div>
        </div>
      </main>
    </div>
  </template>
  
  <style scoped>
  .oauth-email-page {
    @apply min-h-screen flex flex-col bg-gray-100;
  }
  
  .oauth-email-main {
    @apply flex-1 flex flex-col items-center justify-center py-8 px-4;
  }
  
  .oauth-email-welcome {
    @apply mb-6 text-center;
  }
  
  .oauth-email-welcome-highlight {
    @apply text-xl font-semibold text-primary;
  }
  
  .oauth-email-welcome-text {
    @apply text-lg font-medium text-gray-600 ml-2;
  }
  
  .oauth-email-card {
    @apply bg-white shadow-md rounded-2xl w-full max-w-md p-8;
  }
  
  .oauth-email-title {
    @apply text-xl font-bold text-center mb-4 text-gray-700;
  }
  
  .oauth-email-description {
    @apply text-sm text-gray-500 text-center mb-6 leading-relaxed;
  }
  
  .oauth-email-field {
    @apply mb-6;
  }
  
  .oauth-email-label {
    @apply block text-sm font-medium text-gray-600 mb-2;
  }
  
  .oauth-email-input {
    @apply w-full;
  }
  
  .oauth-email-buttons {
    @apply space-y-3;
  }
  
  .oauth-email-submit-button {
    @apply w-full py-2 bg-primary text-white font-medium;
    @apply hover:bg-primary-hover transition-all duration-200;
    @apply disabled:bg-gray-300 disabled:cursor-not-allowed;
  }
  
  .oauth-email-cancel-button {
    @apply w-full py-2 bg-white text-gray-600 border border-gray-300 font-medium;
    @apply hover:bg-gray-100 transition-all duration-200;
  }
  </style>