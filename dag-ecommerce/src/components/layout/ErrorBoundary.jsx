import { Component } from 'react';
import ErrorFallback from './ErrorFallback';

/**
 * Barrière d'erreur. `resetKey` (ex. le chemin courant) : la barrière se réarme quand il change.
 * @extends {Component<{ resetKey?: string, children?: import('react').ReactNode }>}
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[DAG] Erreur de rendu', error, info?.componentStack);
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback onRetry={() => window.location.reload()} />;
  }
}
