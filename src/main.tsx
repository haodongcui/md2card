import { render } from 'preact';
import '@fontsource-variable/noto-sans-sc/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import 'katex/dist/katex.min.css';
import './styles/app.css';
import './styles/card-themes.css';
import './styles/workbench.css';
import { App } from './app/App';

render(<App />, document.getElementById('app')!);
