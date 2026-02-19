import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useLocale } from '../../i18n/LocaleContext'

export interface AppDialogAlertOptions {
  title?: string
  message: string
  confirmText?: string
}

export interface AppDialogConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

type DialogRequest = {
  id: number
  kind: 'alert' | 'confirm'
  variant: 'info' | 'danger'
  title: string
  message: string
  confirmText: string
  cancelText: string
  resolve: (value: boolean) => void
}
type EnqueueRequest = Omit<DialogRequest, 'id' | 'resolve'>

export interface AppDialogApi {
  info: (options: AppDialogAlertOptions | string) => Promise<void>
  alert: (options: AppDialogAlertOptions | string) => Promise<void>
  confirm: (options: AppDialogConfirmOptions | string) => Promise<boolean>
  confirmDanger: (options: AppDialogConfirmOptions | string) => Promise<boolean>
}

const AppDialogContext = createContext<AppDialogApi | null>(null)

function toAlertOptions(input: AppDialogAlertOptions | string): AppDialogAlertOptions {
  return typeof input === 'string' ? { message: input } : input
}

function toConfirmOptions(input: AppDialogConfirmOptions | string): AppDialogConfirmOptions {
  return typeof input === 'string' ? { message: input } : input
}

export const AppDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLocale()
  const idRef = useRef(1)
  const queueRef = useRef<DialogRequest[]>([])
  const [current, setCurrent] = useState<DialogRequest | null>(null)

  const flushNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null
    setCurrent(next)
  }, [])

  const enqueue = useCallback((request: EnqueueRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const item: DialogRequest = {
        ...request,
        id: idRef.current++,
        resolve,
      }
      queueRef.current.push(item)
      setCurrent((prev) => prev ?? queueRef.current.shift() ?? null)
    })
  }, [])

  const info = useCallback<AppDialogApi['info']>(async (input) => {
    const options = toAlertOptions(input)
    await enqueue({
      kind: 'alert',
      variant: 'info',
      title: options.title ?? t('dialog.infoTitle'),
      message: options.message,
      confirmText: options.confirmText ?? t('common.ok'),
      cancelText: t('common.cancel'),
    })
  }, [enqueue, t])

  const alert = useCallback<AppDialogApi['alert']>((input) => {
    return info(input)
  }, [info])

  const confirm = useCallback<AppDialogApi['confirm']>((input) => {
    const options = toConfirmOptions(input)
    return enqueue({
      kind: 'confirm',
      variant: 'info',
      title: options.title ?? t('dialog.confirmTitle'),
      message: options.message,
      confirmText: options.confirmText ?? t('common.ok'),
      cancelText: options.cancelText ?? t('common.cancel'),
    })
  }, [enqueue, t])

  const confirmDanger = useCallback<AppDialogApi['confirmDanger']>((input) => {
    const options = toConfirmOptions(input)
    return enqueue({
      kind: 'confirm',
      variant: 'danger',
      title: options.title ?? t('dialog.dangerTitle'),
      message: options.message,
      confirmText: options.confirmText ?? t('common.continue'),
      cancelText: options.cancelText ?? t('common.cancel'),
    })
  }, [enqueue, t])

  const onAccept = useCallback(() => {
    if (!current) return
    current.resolve(true)
    flushNext()
  }, [current, flushNext])

  const onCancel = useCallback(() => {
    if (!current) return
    current.resolve(false)
    flushNext()
  }, [current, flushNext])

  const contextValue = useMemo<AppDialogApi>(
    () => ({ info, alert, confirm, confirmDanger }),
    [info, alert, confirm, confirmDanger],
  )

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {current && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
            <div className="border-b border-gray-700 px-4 py-3">
              <h3
                className={`text-base font-semibold ${
                  current.variant === 'danger' ? 'text-red-300' : 'text-white'
                }`}
              >
                {current.title}
              </h3>
            </div>
            <div className="px-4 py-4 text-sm text-gray-200 whitespace-pre-wrap break-words">
              {current.message}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-700 px-4 py-3">
              {current.kind === 'confirm' && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-600"
                >
                  {current.cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={onAccept}
                className={`rounded px-3 py-1.5 text-sm text-white ${
                  current.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {current.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  )
}

export function useAppDialog(): AppDialogApi {
  const context = useContext(AppDialogContext)
  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider')
  }
  return context
}
