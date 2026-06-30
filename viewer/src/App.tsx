import { Toolbar } from './components/Toolbar'
import { Board } from './components/Board'
import { Breadcrumb } from './components/Breadcrumb'
import { SidePanel } from './components/SidePanel'

export default function App() {
  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <div className="canvas-wrap">
          <Breadcrumb />
          <Board />
        </div>
        <SidePanel />
      </div>
    </div>
  )
}
