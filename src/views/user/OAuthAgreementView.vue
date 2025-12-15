<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/UseStore'
import { connectWebSocket } from '@/utils/webSocket'
import Button from '@/components/Button.vue'
import oauthApi from '@/services/user/oauth_api'
import userApi from '@/services/user/user_api'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const companyInfo = ref(null)
const isLoading = ref(false)
const tempToken = ref('')

const agreements = reactive({
  termsOfService: false,
  privacyPolicy: false,
  marketingConsent: false,
})

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
 * 전체 동의
 */
const agreeAll = () => {
  const allChecked = isAllAgreed.value
  agreements.termsOfService = !allChecked
  agreements.privacyPolicy = !allChecked
  agreements.marketingConsent = !allChecked
}

/**
 * 전체 동의 여부
 */
const isAllAgreed = computed(() => {
  return agreements.termsOfService && agreements.privacyPolicy && agreements.marketingConsent
})

/**
 * 필수 동의 여부
 */
const isRequiredAgreed = computed(() => {
  return agreements.termsOfService && agreements.privacyPolicy
})

/**
 * 회원가입 완료
 */
const handleSubmit = async () => {
  if (!isRequiredAgreed.value) {
    alert('필수 약관에 동의해주세요.')
    return
  }

  isLoading.value = true

  try {
    const response = await oauthApi.completeSignup({
      token: tempToken.value, // ← tempToken → token
      termsAgreed: agreements.termsOfService,
      privacyAgreed: agreements.privacyPolicy,
      marketingAgreed: agreements.marketingConsent,
    })

    if (response.isSuccess && response.data) {
      const loginResult = response.data

      // Store에 사용자 정보 저장
      authStore.login(
        {
          userId: loginResult.userId,
          name: loginResult.name,
          email: loginResult.email,
        },
        'USER',
        loginResult.companyId,
        companyInfo.value?.companySlug,
      )

      // WebSocket 연결
      try {
        await connectWebSocket()
      } catch (wsError) {
        console.error('WebSocket 연결 실패:', wsError)
      }

      alert('회원가입이 완료되었습니다!')
      router.push(`/c/${route.params.companySlug}/services`)
    } else {
      alert(response.message || '회원가입에 실패했습니다.')
    }
  } catch (error) {
    console.error('회원가입 실패:', error)

    const errorCode = error.response?.data?.code

    if (errorCode === 50023) {
      alert('인증이 만료되었습니다. 다시 시도해주세요.')
      router.push(`/c/${route.params.companySlug}/`)
    } else {
      alert(error.response?.data?.message || '회원가입에 실패했습니다.')
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
  <div class="oauth-agreement-page">
    <main class="oauth-agreement-main">
      <!-- 환영 메시지 -->
      <div v-if="companyInfo" class="oauth-agreement-welcome">
        <span class="oauth-agreement-welcome-highlight">{{ companyInfo.companyName }}</span>
        <span class="oauth-agreement-welcome-text">서비스 가입</span>
      </div>

      <!-- 약관 동의 카드 -->
      <div class="oauth-agreement-card">
        <h2 class="oauth-agreement-title">약관 동의</h2>

        <!-- 전체 동의 -->
        <div class="oauth-agreement-all">
          <label class="oauth-agreement-checkbox-label">
            <input
              type="checkbox"
              :checked="isAllAgreed"
              @change="agreeAll"
              class="oauth-agreement-checkbox"
            />
            <span class="oauth-agreement-checkbox-text-all">전체 동의</span>
          </label>
        </div>

        <div class="oauth-agreement-divider"></div>

        <!-- 개별 약관 -->
        <div class="oauth-agreement-items">
          <!-- 이용약관 -->
          <label class="oauth-agreement-checkbox-label">
            <input
              type="checkbox"
              v-model="agreements.termsOfService"
              class="oauth-agreement-checkbox"
            />
            <span class="oauth-agreement-checkbox-text">
              <span class="oauth-agreement-required">[필수]</span> 서비스 이용약관 동의
            </span>
          </label>

          <!-- 개인정보 처리방침 -->
          <label class="oauth-agreement-checkbox-label">
            <input
              type="checkbox"
              v-model="agreements.privacyPolicy"
              class="oauth-agreement-checkbox"
            />
            <span class="oauth-agreement-checkbox-text">
              <span class="oauth-agreement-required">[필수]</span> 개인정보 처리방침 동의
            </span>
          </label>

          <!-- 마케팅 수신 -->
          <label class="oauth-agreement-checkbox-label">
            <input
              type="checkbox"
              v-model="agreements.marketingConsent"
              class="oauth-agreement-checkbox"
            />
            <span class="oauth-agreement-checkbox-text">
              <span class="oauth-agreement-optional">[선택]</span> 마케팅 정보 수신 동의
            </span>
          </label>
        </div>

        <!-- 버튼 -->
        <div class="oauth-agreement-buttons">
          <Button
            @click="handleSubmit"
            :disabled="!isRequiredAgreed || isLoading"
            class="oauth-agreement-submit-button"
          >
            {{ isLoading ? '처리 중...' : '가입 완료' }}
          </Button>
          <Button @click="handleCancel" class="oauth-agreement-cancel-button"> 취소 </Button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.oauth-agreement-page {
  @apply min-h-screen flex flex-col bg-gray-100;
}

.oauth-agreement-main {
  @apply flex-1 flex flex-col items-center justify-center py-8 px-4;
}

.oauth-agreement-welcome {
  @apply mb-6 text-center;
}

.oauth-agreement-welcome-highlight {
  @apply text-xl font-semibold text-primary;
}

.oauth-agreement-welcome-text {
  @apply text-lg font-medium text-gray-600 ml-2;
}

.oauth-agreement-card {
  @apply bg-white shadow-md rounded-2xl w-full max-w-md p-8;
}

.oauth-agreement-title {
  @apply text-xl font-bold text-center mb-6 text-gray-700;
}

.oauth-agreement-all {
  @apply mb-4;
}

.oauth-agreement-divider {
  @apply border-t border-gray-200 my-4;
}

.oauth-agreement-items {
  @apply space-y-3 mb-6;
}

.oauth-agreement-checkbox-label {
  @apply flex items-center cursor-pointer;
}

.oauth-agreement-checkbox {
  @apply w-5 h-5 mr-3 accent-primary;
}

.oauth-agreement-checkbox-text-all {
  @apply text-base font-semibold text-gray-700;
}

.oauth-agreement-checkbox-text {
  @apply text-sm text-gray-600;
}

.oauth-agreement-required {
  @apply text-red-500 font-medium;
}

.oauth-agreement-optional {
  @apply text-gray-400 font-medium;
}

.oauth-agreement-buttons {
  @apply space-y-3;
}

.oauth-agreement-submit-button {
  @apply w-full py-2 bg-primary text-white font-medium;
  @apply hover:bg-primary-hover transition-all duration-200;
  @apply disabled:bg-gray-300 disabled:cursor-not-allowed;
}

.oauth-agreement-cancel-button {
  @apply w-full py-2 bg-white text-gray-600 border border-gray-300 font-medium;
  @apply hover:bg-gray-100 transition-all duration-200;
}
</style>
