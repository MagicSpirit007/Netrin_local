type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
}

/** Labelled text input / textarea. */
export function TextField({ label, value, onChange, placeholder, multiline = false, rows = 3 }: TextFieldProps) {
  const inputId = useId()
  return (
    <label className="nfield" htmlFor={inputId}>
      <span className="nfield__label">{label}</span>
      {multiline ? (
        <textarea id={inputId} value={value} rows={rows} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={inputId} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

export default TextField
import { useId } from 'react'
