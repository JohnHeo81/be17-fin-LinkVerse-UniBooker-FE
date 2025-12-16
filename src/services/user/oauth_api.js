/**
 * OAuth 소셜 로그인 API
 * - 카카오, 네이버, 구글 OAuth 처리
 */
import axiosInstance from '@/plugin/axiosInterceptor'

const oauthApi = {
  /**
   * OAuth 로그인 시작 (리다이렉트)
   * - 백엔드에서 OAuth 제공자로 리다이렉트 처리
   */
  startOAuth: (provider, companySlug) => {
    const backendUrl = import.meta.env.VITE_API_BASE_URL || ''
    window.location.href = `${backendUrl}/api/oauth/${provider}?companySlug=${companySlug}`
  },

  /**
   * OAuth 회원가입 완료 (약관 동의 후)
   */
  completeSignup: async (data) => {
    const response = await axiosInstance.post('/api/oauth/complete', data, {
      withCredentials: true,
    })
    return response.data
  },

  /**
   * 이메일 입력 (카카오 등 이메일 미제공 시)
   */
  submitEmail: async (data) => {
    const response = await axiosInstance.post('/api/oauth/email', data, {
      withCredentials: true,
    })
    return response.data
  },

  // ========== 소셜 계정 연동 관리 ==========

  /**
   * 연동된 소셜 계정 목록 조회
   */
  getLinkedAccounts: async () => {
    const response = await axiosInstance.get('/api/oauth/accounts', {
      withCredentials: true,
    })
    return response.data
  },

  /**
   * 소셜 계정 연동 시작 (마이페이지에서)
   */
  startLinkOAuth: (provider) => {
    const backendUrl = import.meta.env.VITE_API_BASE_URL || ''
    window.location.href = `${backendUrl}/api/oauth/link/${provider}`
  },

  /**
   * 소셜 계정 연동 해제
   */
  unlinkAccount: async (provider) => {
    const response = await axiosInstance.delete(`/api/oauth/accounts/${provider}`, {
      withCredentials: true,
    })
    return response.data
  },
}

export default oauthApi
