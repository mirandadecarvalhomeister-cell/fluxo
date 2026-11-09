import { Component } from 'react';
import { Logo } from './Brand';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('FluXo travou:', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <Logo size={52} />
        <h1>Algo saiu do fluxo</h1>
        <p>
          Encontramos um problema inesperado. Recarregue a página para continuar de onde
          parou.
        </p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}
