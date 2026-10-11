// Package httpapi is the HTTP surface: the ServeMux, middleware chain, the
// response envelope and the JSON encoding rules. It mirrors the Node server's
// wire contract (envelope fields, no HTML escaping, explicit nulls).
package httpapi

// Response is a fully-formed handler result: the declared HTTP status and the
// JSON body. Handlers build it with the envelope helpers below so every route
// emits the same shape.
type Response struct {
	Status int
	Body   map[string]any
}

// OK returns a 200 success envelope with a payload (payload may be nil, which
// is encoded as JSON null).
func OK(message string, payload any) Response {
	return OKStatus(200, message, payload)
}

// OKStatus returns a success envelope with an explicit status.
func OKStatus(status int, message string, payload any) Response {
	return Response{Status: status, Body: map[string]any{
		"success": true,
		"message": message,
		"payload": payload,
	}}
}

// OKNoPayload returns a success envelope with the payload key omitted, matching
// the handlers that answer with only success/message.
func OKNoPayload(status int, message string) Response {
	return Response{Status: status, Body: map[string]any{
		"success": true,
		"message": message,
	}}
}

// Fail returns a failure envelope. When payload is nil the payload key is
// omitted, matching the ts-rest handlers' `{success:false,message}` bodies.
func Fail(status int, message string, payload any) Response {
	body := map[string]any{"success": false, "message": message}
	if payload != nil {
		body["payload"] = payload
	}
	return Response{Status: status, Body: body}
}

// Deny is the route-policy denial shape: `{success:false,message}` with no
// payload key.
func Deny(status int, message string) Response { return Fail(status, message, nil) }
