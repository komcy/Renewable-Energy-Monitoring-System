const EMAIL_RE = /^\S+@\S+\.\S+$/

export function validateEmail(value) {
  if (!value.trim()) return 'Email is required'
  if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address'
  return ''
}

export function validatePassword(value, { min = 8 } = {}) {
  if (!value) return 'Password is required'
  if (value.length < min) return `Password must be at least ${min} characters`
  return ''
}

/** 0–4 score with a label, for the strength meter. */
export function passwordStrength(value) {
  let score = 0
  if (value.length >= 8) score++
  if (value.length >= 12) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  return { score, label: labels[score] }
}
