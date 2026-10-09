package user

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 15 users.* routes at their exact method + full path.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("users.joinUser", http.MethodPost, "/api/users/join", []int{200, 400}, h.joinUser)
	s.Register("users.loginUser", http.MethodPost, "/api/users/login", []int{200, 400, 404}, h.loginUser)
	s.Register("users.requestPasswordReset", http.MethodPost, "/api/users/forgot-password", []int{200, 400}, h.requestPasswordReset)
	s.Register("users.resetPassword", http.MethodPost, "/api/users/reset-password", []int{200, 400}, h.resetPassword)
	s.Register("users.verifyEmail", http.MethodPost, "/api/users/verify-email", []int{200, 400}, h.verifyEmail)
	s.Register("users.resendVerification", http.MethodPost, "/api/users/resend-verification", []int{200, 400, 401}, h.resendVerification)
	s.Register("users.setEmail", http.MethodPost, "/api/users/email", []int{200, 400, 401, 409}, h.setEmail)
	s.Register("users.changePassword", http.MethodPost, "/api/users/change-password", []int{200, 400, 401, 403, 404}, h.changePassword)
	s.Register("users.getUser", http.MethodGet, "/api/users/{id}", []int{200, 400, 404}, h.getUser)
	s.Register("users.logoutUser", http.MethodDelete, "/api/users/{id}/logout", []int{200, 400, 404}, h.logoutUser)
	s.Register("users.updateUser", http.MethodPost, "/api/users/{id}/update", []int{200, 400}, h.updateUser)
	s.Register("users.addClubsToUser", http.MethodPost, "/api/users/{id}/add-clubs", []int{200, 400}, h.addClubsToUser)
	s.Register("users.addClubToUser", http.MethodPost, "/api/users/{id}/add-club", []int{200, 400}, h.addClubToUser)
	s.Register("users.removeClubFromUser", http.MethodDelete, "/api/users/{id}/clubs/{club_id}", []int{200, 400}, h.removeClubFromUser)
	s.Register("users.enterSession", http.MethodPost, "/api/users/enter", []int{200, 400, 404}, h.enterSession)
}
