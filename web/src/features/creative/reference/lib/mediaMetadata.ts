export interface DurationUnits {
  hour: string
  minute: string
  second: string
}

export function formatElapsedDuration(
  totalSeconds: number,
  units: DurationUnits
): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}${units.hour}${String(minutes).padStart(2, '0')}${units.minute}${String(remainingSeconds).padStart(2, '0')}${units.second}`
  }
  if (minutes > 0) {
    return `${minutes}${units.minute}${String(remainingSeconds).padStart(2, '0')}${units.second}`
  }
  return `${String(remainingSeconds).padStart(2, '0')}${units.second}`
}

export function formatByteSize(bytes: number): string {
  const safeBytes = Math.max(0, Math.floor(bytes))
  if (safeBytes < 1024) return `${safeBytes} B`
  const kilobytes = safeBytes / 1024
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`
  const megabytes = kilobytes / 1024
  if (megabytes < 1024) return `${megabytes.toFixed(1)} MB`
  return `${(megabytes / 1024).toFixed(1)} GB`
}
