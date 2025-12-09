import axiosInstance from '@/plugin/axiosInterceptor'

/** 대기열 진입 */
const joinQueue = async (resourceId) => {
  try {
    const response = await axiosInstance.post(`/api/queues/${resourceId}/join`)
    return response.data.data // BaseResponse의 data 필드
  } catch (error) {
    console.error('[Queue API] joinQueue error:', error)
    throw error
  }
}

/** 대기열 상태 조회 */
const getQueueStatus = async (resourceId, token) => {
  try {
    const response = await axiosInstance.get(`/api/queues/${resourceId}/status`, {
      params: { token },
    })
    return response.data.data // BaseResponse의 data 필드
  } catch (error) {
    console.error('[Queue API] getQueueStatus error:', error)
    throw error
  }
}

/** 토큰 소비 (입장) */
const consumeQueueToken = async (resourceId, token) => {
  try {
    const response = await axiosInstance.post(`/api/queues/${resourceId}/tokens/${token}/consume`)
    return response.data.data // BaseResponse의 data 필드
  } catch (error) {
    console.error('[Queue API] consumeQueueToken error:', error)
    throw error
  }
}

/** 대기열 이탈 */
const leaveQueue = async (resourceId, token) => {
  try {
    const response = await axiosInstance.delete(`/api/queues/${resourceId}/leave`, {
      params: { token },
    })
    return response.data.data
  } catch (error) {
    console.error('[Queue API] leaveQueue error:', error)
    throw error
  }
}

export default {
  joinQueue,
  getQueueStatus,
  consumeQueueToken,
  leaveQueue,
}