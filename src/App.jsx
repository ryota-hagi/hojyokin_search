import SubsidySearchChat from './components/SubsidySearchChat'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <SubsidySearchChat />
    </ErrorBoundary>
  )
}

export default App