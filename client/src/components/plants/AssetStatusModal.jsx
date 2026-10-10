import { Power, PowerOff } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { assetsApi } from '@/api/plants'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

/** Confirms activating or deactivating an asset. */
export default function AssetStatusModal({ asset, onClose, onChanged }) {
  const [saving, setSaving] = useState(false)
  const deactivating = asset?.status === 'Active'

  const confirm = async () => {
    setSaving(true)
    try {
      const updated = await assetsApi.setStatus(asset.id, deactivating ? 'Deactivated' : 'Active')
      toast.success(`${asset.assetCode} ${deactivating ? 'deactivated' : 'activated'}`)
      onChanged(updated)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not change the asset status'))
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(asset)}
      onClose={onClose}
      busy={saving}
      size="sm"
      title={deactivating ? `Deactivate ${asset?.assetCode}?` : `Activate ${asset?.assetCode}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant={deactivating ? 'danger' : 'primary'} onClick={confirm} loading={saving}>
            {deactivating ? <PowerOff className="size-4" /> : <Power className="size-4" />}
            {deactivating ? 'Deactivate' : 'Activate'}
          </Button>
        </>
      }
    >
      {asset && (
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">{asset.name}</span> ({asset.assetCode})
          </p>
          {deactivating ? (
            <ul className="list-disc space-y-1 pl-5">
              <li>New telemetry for this asset will be rejected, and the simulator will skip it.</li>
              <li>Its history, alerts and reports are kept.</li>
              <li>You can reactivate it at any time.</li>
            </ul>
          ) : (
            <p>The asset will accept telemetry again and be included in live monitoring and the simulator.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
