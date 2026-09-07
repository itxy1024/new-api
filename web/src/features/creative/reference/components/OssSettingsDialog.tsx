import { zodResolver } from '@hookform/resolvers/zod'
import { DatabaseIcon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'

import {
  getCreativeStorageConfig,
  testCreativeStorageConfig,
  updateCreativeStorageConfig,
} from '../lib/creativeStorage'

interface OssSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface OssFormValues {
  enabled: boolean
  endpoint: string
  bucket: string
  region: string
  prefix: string
  pathStyle: boolean
  accessKey: string
  secretKey: string
}

const EMPTY_VALUES: OssFormValues = {
  enabled: false,
  endpoint: '',
  bucket: '',
  region: '',
  prefix: 'newapi',
  pathStyle: false,
  accessKey: '',
  secretKey: '',
}

export default function OssSettingsDialog(props: OssSettingsDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [accessKeyConfigured, setAccessKeyConfigured] = useState(false)
  const [secretKeyConfigured, setSecretKeyConfigured] = useState(false)
  const schema = useMemo(
    () =>
      z
        .object({
          enabled: z.boolean(),
          endpoint: z.string(),
          bucket: z.string(),
          region: z.string(),
          prefix: z.string(),
          pathStyle: z.boolean(),
          accessKey: z.string(),
          secretKey: z.string(),
        })
        .superRefine((values, context) => {
          if (!values.enabled) return
          const requiredFields: Array<keyof OssFormValues> = [
            'endpoint',
            'bucket',
            'region',
          ]
          for (const field of requiredFields) {
            if (!String(values[field]).trim()) {
              context.addIssue({
                code: 'custom',
                path: [field],
                message: t('This field is required'),
              })
            }
          }
          if (!values.accessKey.trim() && !accessKeyConfigured) {
            context.addIssue({
              code: 'custom',
              path: ['accessKey'],
              message: t('This field is required'),
            })
          }
          if (!values.secretKey.trim() && !secretKeyConfigured) {
            context.addIssue({
              code: 'custom',
              path: ['secretKey'],
              message: t('This field is required'),
            })
          }
        }),
    [accessKeyConfigured, secretKeyConfigured, t]
  )
  const form = useForm<OssFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  })
  const enabled = useWatch({ control: form.control, name: 'enabled' })

  useEffect(() => {
    if (!props.open) return
    let active = true
    void getCreativeStorageConfig()
      .then((config) => {
        if (!active) return
        setAccessKeyConfigured(config.access_key_configured)
        setSecretKeyConfigured(config.secret_key_configured)
        form.reset({
          enabled: config.enabled,
          endpoint: config.endpoint,
          bucket: config.bucket,
          region: config.region,
          prefix: config.prefix || 'newapi',
          pathStyle: config.path_style,
          accessKey: '',
          secretKey: '',
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [form, props.open])

  const toInput = (values: OssFormValues) => ({
    enabled: values.enabled,
    endpoint: values.endpoint.trim(),
    bucket: values.bucket.trim(),
    region: values.region.trim(),
    prefix: values.prefix.trim(),
    path_style: values.pathStyle,
    access_key: values.accessKey.trim(),
    secret_key: values.secretKey.trim(),
  })

  const handleSave = form.handleSubmit(async (values) => {
    setSaving(true)
    try {
      await updateCreativeStorageConfig(toInput(values))
      setAccessKeyConfigured(
        Boolean(values.accessKey.trim()) || accessKeyConfigured
      )
      setSecretKeyConfigured(
        Boolean(values.secretKey.trim()) || secretKeyConfigured
      )
      form.setValue('accessKey', '')
      form.setValue('secretKey', '')
      toast.success(t('OSS settings saved'))
      props.onOpenChange(false)
    } finally {
      setSaving(false)
    }
  })

  const handleTest = form.handleSubmit(async (values) => {
    setTesting(true)
    try {
      await testCreativeStorageConfig(toInput(values))
      toast.success(t('OSS connection succeeded'))
    } finally {
      setTesting(false)
    }
  })

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='!flex h-[85vh] max-h-[720px] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:h-[600px] sm:max-w-3xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:rounded-full'>
        <DialogHeader className='shrink-0 border-b px-5 py-5'>
          <DialogTitle className='flex items-center gap-2 text-lg font-bold'>
            <HugeiconsIcon
              aria-hidden='true'
              className='size-5 text-blue-500'
              icon={Settings02Icon}
              strokeWidth={2}
            />
            {t('Settings')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t(
              'Generated files are stored in browser cache and S3-compatible OSS when enabled.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 flex-1 flex-col sm:flex-row'>
          <nav
            aria-label={t('Settings')}
            className='w-full shrink-0 border-b bg-gray-50/50 p-3 sm:w-48 sm:border-r sm:border-b-0 dark:bg-white/[0.02]'
            data-settings-sidebar
          >
            <button
              aria-current='page'
              className='flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-medium whitespace-nowrap text-blue-600 shadow-sm dark:bg-white/[0.08] dark:text-blue-400'
              type='button'
            >
              <HugeiconsIcon
                aria-hidden='true'
                className='size-4 shrink-0'
                icon={DatabaseIcon}
                strokeWidth={2}
              />
              {t('Storage management')}
            </button>
          </nav>
          <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6'>
              <div className='mb-5'>
                <h4 className='text-base font-semibold text-gray-800 dark:text-gray-100'>
                  {t('Creative result storage')}
                </h4>
                <p className='mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400'>
                  {t(
                    'Generated files are stored in browser cache and S3-compatible OSS when enabled.'
                  )}
                </p>
              </div>
              {loading ? (
                <div className='flex min-h-48 items-center justify-center'>
                  <Spinner />
                </div>
              ) : (
                <form id='creative-oss-form' onSubmit={handleSave}>
                  <FieldGroup>
                    <Field orientation='horizontal'>
                      <div className='flex flex-1 flex-col gap-0.5'>
                        <FieldLabel htmlFor='creative-oss-enabled'>
                          {t('Enable OSS storage')}
                        </FieldLabel>
                        <FieldDescription>
                          {t(
                            'New results will be saved by the server after generation.'
                          )}
                        </FieldDescription>
                      </div>
                      <Controller
                        control={form.control}
                        name='enabled'
                        render={({ field }) => (
                          <Switch
                            id='creative-oss-enabled'
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </Field>
                    <Field
                      data-disabled={!enabled}
                      data-invalid={Boolean(form.formState.errors.endpoint)}
                    >
                      <FieldLabel htmlFor='creative-oss-endpoint'>
                        {t('Endpoint')}
                      </FieldLabel>
                      <Input
                        id='creative-oss-endpoint'
                        placeholder='https://s3.example.com'
                        disabled={!enabled}
                        aria-invalid={Boolean(form.formState.errors.endpoint)}
                        {...form.register('endpoint')}
                      />
                      <FieldError errors={[form.formState.errors.endpoint]} />
                    </Field>
                    <div className='grid gap-5 sm:grid-cols-2'>
                      <Field
                        data-disabled={!enabled}
                        data-invalid={Boolean(form.formState.errors.bucket)}
                      >
                        <FieldLabel htmlFor='creative-oss-bucket'>
                          {t('Bucket')}
                        </FieldLabel>
                        <Input
                          id='creative-oss-bucket'
                          disabled={!enabled}
                          aria-invalid={Boolean(form.formState.errors.bucket)}
                          {...form.register('bucket')}
                        />
                        <FieldError errors={[form.formState.errors.bucket]} />
                      </Field>
                      <Field
                        data-disabled={!enabled}
                        data-invalid={Boolean(form.formState.errors.region)}
                      >
                        <FieldLabel htmlFor='creative-oss-region'>
                          {t('Region')}
                        </FieldLabel>
                        <Input
                          id='creative-oss-region'
                          placeholder='us-east-1'
                          disabled={!enabled}
                          aria-invalid={Boolean(form.formState.errors.region)}
                          {...form.register('region')}
                        />
                        <FieldError errors={[form.formState.errors.region]} />
                      </Field>
                    </div>
                    <div className='grid gap-5 sm:grid-cols-2'>
                      <Field
                        data-disabled={!enabled}
                        data-invalid={Boolean(form.formState.errors.accessKey)}
                      >
                        <FieldLabel htmlFor='creative-oss-access-key'>
                          {t('Access Key')}
                        </FieldLabel>
                        <Input
                          id='creative-oss-access-key'
                          autoComplete='off'
                          placeholder={
                            accessKeyConfigured
                              ? t('Configured, leave blank to keep')
                              : ''
                          }
                          disabled={!enabled}
                          aria-invalid={Boolean(
                            form.formState.errors.accessKey
                          )}
                          {...form.register('accessKey')}
                        />
                        <FieldError
                          errors={[form.formState.errors.accessKey]}
                        />
                      </Field>
                      <Field
                        data-disabled={!enabled}
                        data-invalid={Boolean(form.formState.errors.secretKey)}
                      >
                        <FieldLabel htmlFor='creative-oss-secret-key'>
                          {t('Secret Key')}
                        </FieldLabel>
                        <Input
                          id='creative-oss-secret-key'
                          type='password'
                          autoComplete='new-password'
                          placeholder={
                            secretKeyConfigured
                              ? t('Configured, leave blank to keep')
                              : ''
                          }
                          disabled={!enabled}
                          aria-invalid={Boolean(
                            form.formState.errors.secretKey
                          )}
                          {...form.register('secretKey')}
                        />
                        <FieldError
                          errors={[form.formState.errors.secretKey]}
                        />
                      </Field>
                    </div>
                    <Field data-disabled={!enabled}>
                      <FieldLabel htmlFor='creative-oss-prefix'>
                        {t('Object prefix')}
                      </FieldLabel>
                      <Input
                        id='creative-oss-prefix'
                        disabled={!enabled}
                        {...form.register('prefix')}
                      />
                    </Field>
                    <Field orientation='horizontal' data-disabled={!enabled}>
                      <div className='flex flex-1 flex-col gap-0.5'>
                        <FieldLabel htmlFor='creative-oss-path-style'>
                          {t('Path-style access')}
                        </FieldLabel>
                        <FieldDescription>
                          {t(
                            'Enable this for storage services such as MinIO that require bucket names in the URL path.'
                          )}
                        </FieldDescription>
                      </div>
                      <Controller
                        control={form.control}
                        name='pathStyle'
                        render={({ field }) => (
                          <Switch
                            id='creative-oss-path-style'
                            checked={field.value}
                            disabled={!enabled}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </Field>
                  </FieldGroup>
                </form>
              )}
            </div>
            <DialogFooter className='m-0 shrink-0 rounded-none border-t bg-gray-50/50 p-4 dark:bg-white/[0.02]'>
              <Button
                type='button'
                variant='outline'
                disabled={loading || saving || testing || !enabled}
                onClick={handleTest}
              >
                {testing && <Spinner data-icon='inline-start' />}
                {t('Test connection')}
              </Button>
              <Button
                type='submit'
                form='creative-oss-form'
                disabled={loading || saving || testing}
              >
                {saving && <Spinner data-icon='inline-start' />}
                {t('Save')}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
