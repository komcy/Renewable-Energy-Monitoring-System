import { Component } from 'react'
import ErrorFallback from './ErrorFallback'

/**
 * Last line of defence for render errors outside the router (providers,
 * toasts). Errors inside routes are handled by RouteErrorPage.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[REMS] Unhandled UI error', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} fullPage onReset={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}
