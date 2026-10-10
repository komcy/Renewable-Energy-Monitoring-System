import { Eye, EyeOff, Lock } from 'lucide-react'
import { useState } from 'react'
import FormField from './FormField'

export default function PasswordField(props) {
  const [visible, setVisible] = useState(false)
  return (
    <FormField
      icon={Lock}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
      {...props}
    />
  )
}
