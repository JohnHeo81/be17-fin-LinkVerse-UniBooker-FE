import axiosInstance from '@/plugin/axiosInterceptor'

/** Hold 생성 (시간/좌석 선택) */
const createHold = async (resourceId, data) => {
  try {
    const response = await axiosInstance.post(`/api/holds/${resourceId}`, data)
    return response.data.data
  } catch (error) {
    console.error('[Hold API] createHold error:', error)
    throw error
  }
}

/** Hold 해제 (선택 취소) */
const releaseHold = async (resourceId, data) => {
  try {
    const response = await axiosInstance.delete(`/api/holds/${resourceId}`, { data })
    return response.data.data
  } catch (error) {
    console.error('[Hold API] releaseHold error:', error)
    throw error
  }
}

/** Hold 상태 조회 */
const getHoldStatus = async (resourceId, date) => {
  try {
    const response = await axiosInstance.get(`/api/holds/${resourceId}/status`, {
      params: { date },
    })
    return response.data.data
  } catch (error) {
    console.error('[Hold API] getHoldStatus error:', error)
    throw error
  }
}

export default {
  createHold,
  releaseHold,
  getHoldStatus,
}