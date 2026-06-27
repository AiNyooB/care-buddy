/* eslint-disable @typescript-eslint/no-namespace */
import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'number-flow': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}