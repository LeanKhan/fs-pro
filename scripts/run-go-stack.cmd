@echo off
REM One-command launcher for the Go-only stack. Passes args through, e.g.
REM   scripts\run-go-stack.cmd            start everything
REM   scripts\run-go-stack.cmd -Stop      stop everything
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-go-stack.ps1" %*
