import { Component, type ReactNode, type ErrorInfo } from 'react';
import i18n from 'i18next';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4 text-center max-w-xs">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-muted-foreground">{i18n.t('error.title')}</p>
            <Button onClick={this.handleReload}>{i18n.t('error.reload')}</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
