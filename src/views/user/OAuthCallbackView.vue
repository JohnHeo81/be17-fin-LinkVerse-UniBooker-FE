<script setup>
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/UseStore'
import { connectWebSocket } from '@/utils/webSocket'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isLoading = ref(true)
const errorMessage = ref('')

onMounted(async () => {
  await handleCallback()
})

/**
 * OAuth 콜백 처리
 * - status: success / new / error
 */
const handleCallback = async () => {
  const companySlug = route.params.companySlug
  const status = route.query.status
  const userId = route.query.userId
  const token = route.query.token
  const message = route.query.message
  const name = route.query.name
  const email = route.query.email

  try {
    // 1. 에러 처리
    if (status === 'error') {
      errorMessage.value = message || 'OAuth 인증에 실패했습니다.'
      isLoading.value = false
      return
    }

    // 2. 기존 사용자 - 바로 로그인 완료
    if (status === 'success' && userId) {
      // 쿠키는 백엔드에서 이미 설정됨
      // Store에 사용자 정보 저장
      authStore.login(
        { userId: parseInt(userId), name, email },
        'USER',
        null, // companyId는 나중에 API로 조회
        companySlug,
      )

      // WebSocket 연결
      try {
        await connectWebSocket()
      } catch (wsError) {
        console.error('WebSocket 연결 실패:', wsError)
      }

      alert('로그인 성공!')
      router.push(`/c/${companySlug}/services`)
      return
    }

    // 3. 이메일 입력 필요 (카카오)
    if (status === 'email_required' && token) {
      router.push({
        name: 'OAuthEmail',
        params: { companySlug },
        query: { token },
      })
      return
    }

    // 4. 신규 사용자 - 약관 동의 페이지로 이동
    if (status === 'new' && token) {
      router.push({
        name: 'OAuthAgreement',
        params: { companySlug },
        query: { token },
      })
      return
    }

    // 5. 알 수 없는 상태
    errorMessage.value = '잘못된 접근입니다.'
    isLoading.value = false
  } catch (error) {
    console.error('OAuth 콜백 처리 실패:', error)
    errorMessage.value = '로그인 처리 중 오류가 발생했습니다.'
    isLoading.value = false
  }
}

/**
 * 로그인 페이지로 돌아가기
 */
const goToLogin = () => {
  const companySlug = route.params.companySlug
  router.push(`/c/${companySlug}/`)
}
</script>

<template>
  <div class="oauth-callback-page">
    <!-- 로딩 중 -->
    <div v-if="isLoading" class="oauth-callback-loading">
      <div class="oauth-callback-spinner"></div>
      <p class="oauth-callback-text">로그인 처리 중...</p>
    </div>

    <!-- 에러 발생 -->
    <div v-else class="oauth-callback-error">
      <div class="oauth-callback-error-icon">⚠️</div>
      <p class="oauth-callback-error-message">{{ errorMessage }}</p>
      <button @click="goToLogin" class="oauth-callback-button">로그인 페이지로 돌아가기</button>
    </div>
  </div>
</template>

<style scoped>
.oauth-callback-page {
  @apply min-h-screen flex items-center justify-center bg-gray-100;
}

.oauth-callback-loading {
  @apply flex flex-col items-center;
}

.oauth-callback-spinner {
  @apply w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin;
}

.oauth-callback-text {
  @apply mt-4 text-gray-600 text-lg;
}

.oauth-callback-error {
  @apply flex flex-col items-center bg-white p-10 rounded-xl shadow-md;
}

.oauth-callback-error-icon {
  @apply text-5xl mb-4;
}

.oauth-callback-error-message {
  @apply text-gray-700 text-lg mb-6 text-center;
}

.oauth-callback-button {
  @apply px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-all;
}
</style>
