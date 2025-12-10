<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import queueApi from '@/services/reservation/queue_api'
import serviceApi from '@/services/user/service_api'

const route = useRoute()
const router = useRouter()

// Path params
const serviceId = Number(route.params.serviceId)
const serviceGroupId = route.params.serviceGroupId
const companySlug = route.params.companySlug

// ----------- TOKEN 관리 -----------
const LOCAL_KEY = `queueToken:${serviceId}`
const queueToken = ref(localStorage.getItem(LOCAL_KEY) || null)

// 화면 상태
const serviceInfo = ref({})
const userQueuePosition = ref(null)
const totalQueueSize = ref(null)
const estimatedWaitSeconds = ref(null)

let pollingTimer = null

/** 서비스 정보 조회 */
const loadServiceInfo = async () => {
  try {
    serviceInfo.value = await serviceApi.getService(serviceId)
  } catch (err) {
    console.error('서비스 정보 로딩 실패', err)
  }
}

/** 대기열 진입 */
const joinQueue = async () => {
  if (queueToken.value) {
    console.log('[QUEUE] 기존 token 있음 → join 생략', queueToken.value)
    return
  }

  try {
    console.log('[QUEUE] 최초 join 실행')
    const res = await queueApi.joinQueue(serviceId)

    queueToken.value = res.token
    localStorage.setItem(LOCAL_KEY, res.token)
    userQueuePosition.value = res.position

    console.log('[QUEUE] join 성공, token=', res.token)
  } catch (err) {
    console.error('대기열 진입 실패', err)
  }
}

/** 대기열 상태 조회 (Polling) */
const fetchQueueStatus = async () => {
  if (!queueToken.value) return

  try {
    const res = await queueApi.getQueueStatus(serviceId, queueToken.value)

    userQueuePosition.value = res.position
    totalQueueSize.value = res.totalWaiting
    estimatedWaitSeconds.value = res.etaSeconds

    console.log('[QUEUE STATUS]', res)

    // ----- 1) 입장 가능 -----
    if (res.canEnter) {
      console.log('[QUEUE] ACTIVE → 토큰 소비 후 상세페이지 이동')

      await queueApi.consumeQueueToken(serviceId, queueToken.value)

      clearInterval(pollingTimer)
      localStorage.removeItem(LOCAL_KEY)

      navigateToDetail()
      return
    }

    // ----- 2) 토큰 만료 → 재입장 -----
    if (res.position === -1) {
      console.warn('[QUEUE] INVALID TOKEN → rejoin')

      localStorage.removeItem(LOCAL_KEY)
      queueToken.value = null

      await joinQueue()
      return
    }

    // ----- 3) 대기 중 -----
  } catch (err) {
    console.error('대기열 상태 조회 실패', err)
  }
}

/** 상세 페이지 이동 (replace로 히스토리 교체) */
const navigateToDetail = () => {
  // 진입 토큰 설정 (새로고침 감지용)
  sessionStorage.setItem('entryToken', 'valid')
  sessionStorage.setItem('entryResourceId', String(serviceId))

  router.replace({
    path: `/c/${companySlug}/services/${serviceGroupId}/detail/${serviceId}`,
  })
}

/** Lifecycle */
onMounted(async () => {
  await loadServiceInfo()
  await joinQueue()
  await fetchQueueStatus()

  pollingTimer = setInterval(fetchQueueStatus, 3000)
})

onBeforeUnmount(() => {
  clearInterval(pollingTimer)
})
</script>

<template>
  <div class="page-wrapper">
    <div class="waiting-container">
      <!-- 상단 서비스 정보 카드 -->
      <div class="waiting-header">
        <img
          :src="serviceInfo.resourceImage || '/assets/images/no-image.png'"
          alt="서비스 이미지"
          class="waiting-header-img"
        />

        <div class="waiting-header-right">
          <h2 class="waiting-title">{{ serviceInfo.name }}</h2>
          <p class="waiting-desc">{{ serviceInfo.description }}</p>
        </div>
      </div>

      <!-- 대기중 박스 -->
      <div class="waiting-box">
        <h3 class="waiting-box-title">대기열에 참여되었습니다</h3>

        <div class="waiting-status">
          <div class="waiting-item">
            <span class="waiting-label">내 현재 순번</span>
            <span class="waiting-value">{{ userQueuePosition ?? '-' }}번</span>
          </div>

          <div class="waiting-item">
            <span class="waiting-label">전체 대기 인원</span>
            <span class="waiting-value">{{ totalQueueSize ?? '-' }}명</span>
          </div>

          <div class="waiting-item">
            <span class="waiting-label">예상 대기 시간</span>
            <span class="waiting-value">
              {{ estimatedWaitSeconds ? Math.ceil(estimatedWaitSeconds / 60) + '분' : '-' }}
            </span>
          </div>
        </div>

        <p class="waiting-guide">
          페이지를 닫아도 자동으로 순번이 유지되며,<br />
          순번이 되면 예약 페이지로 자동 이동합니다.
        </p>

        <div class="waiting-loader"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-wrapper {
  @apply bg-white min-h-screen;
}

.waiting-container {
  @apply max-w-3xl mx-auto px-10 pt-14 pb-20 flex flex-col;
}

.waiting-header {
  @apply flex items-center gap-8 bg-gray-100 p-6 rounded-sm shadow-sm mb-10;
}

.waiting-header-img {
  @apply w-40 h-32 object-cover rounded-md shadow-sm flex-shrink-0;
}

.waiting-header-right {
  @apply flex flex-col justify-center;
}

.waiting-title {
  @apply text-xl font-semibold text-gray-800 mb-2;
}

.waiting-desc {
  @apply text-sm text-gray-500 leading-relaxed;
}

.waiting-box {
  @apply bg-gray-50 p-10 rounded-lg shadow-sm text-center;
}

.waiting-box-title {
  @apply text-lg font-semibold text-gray-800 mb-6;
}

.waiting-status {
  @apply grid grid-cols-3 gap-6 text-center mb-8;
}

.waiting-item {
  @apply flex flex-col;
}

.waiting-label {
  @apply text-sm text-gray-500;
}

.waiting-value {
  @apply text-2xl font-bold text-primary mt-2;
}

.waiting-guide {
  @apply text-sm text-gray-600 mt-4 leading-relaxed;
}

.waiting-loader {
  @apply mx-auto mt-8 w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin;
}
</style>
