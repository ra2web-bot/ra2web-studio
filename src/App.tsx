import MixEditor from './components/MixEditor'
import { AppDialogProvider } from './components/common/AppDialogProvider'
import { LocaleProvider } from './i18n/LocaleContext'

function App() {
  return (
    <LocaleProvider>
      <AppDialogProvider>
        <div className="h-screen w-full bg-gray-900 text-white">
          <MixEditor />
        </div>
      </AppDialogProvider>
    </LocaleProvider>
  )
}

export default App
