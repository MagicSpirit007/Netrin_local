import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/core/Button'
import { NetrinMap, requestNetrinHeadingPermission } from '../components/domain/NetrinMap'
import { Switch } from '../components/forms/Switch'
import { TextField } from '../components/forms/TextField'
import { PixelIcon } from '../components/icons/PixelIcon'
import { Panel } from '../components/surfaces/Panel'
import { loadMediaBlob, removeMediaBlob, saveMediaBlob } from '../data/drafts'
import type { Coordinate, RecordedPoint, RouteDraft } from '../data/types'
import { compressImage } from '../lib/image'
import { planSegmentsForPoints } from '../lib/routing/campusRoutePlanner'
import { routeLineFromSegments } from '../lib/routing/routeSegments'
import { snapPoint } from '../lib/snap'
import { useNetrinState } from '../state/NetrinState'

const ACTIVE_DRAFT_KEY = 'netrin.activeRouteDraft'

type PointComposer = {
  point: RecordedPoint
  originalPhotoId?: string
}

function reindex(points: RecordedPoint[]): RecordedPoint[] {
  return points.map((point, index) => ({ ...point, index: index + 1 }))
}

function StoredPhoto({ photoId, alt, className }: { photoId: string; alt: string; className: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl = ''
    loadMediaBlob(photoId).then((blob) => {
      if (!active || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId])

  return url ? <img className={className} src={url} alt={alt} /> : null
}

export function CreateScreen() {
  const { t } = useTranslation()
  const {
    addRouteDraft,
    appearanceSettings,
    draftsReady,
    removeRouteDraft,
    routeDrafts,
    setSnapToRoads,
    snapToRoads,
    updateRouteDraft
  } = useNetrinState()

  const [activeDraftId, setActiveDraftId] = useState('')
  const [recording, setRecording] = useState(false)
  const [composer, setComposer] = useState<PointComposer | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateFailed, setLocateFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mediaError, setMediaError] = useState(false)

  const activeDraft = routeDrafts.find((draft) => draft.id === activeDraftId)
  const points = useMemo(() => activeDraft?.points ?? [], [activeDraft])
  const photoCount = points.filter((point) => point.photoId).length
  const routeSegments = useMemo(() => activeDraft?.segments ?? [], [activeDraft])
  const routeCoords = useMemo(
    () => routeLineFromSegments(routeSegments, points.map((point) => point.final)),
    [points, routeSegments]
  )
  const mapStops = useMemo(
    () =>
      points.map((point) => ({
        id: point.id,
        location: point.final,
        index: point.index,
        label: point.text || `${t('record.keyPoint')} ${point.index}`
      })),
    [points, t]
  )

  useEffect(() => {
    if (!draftsReady || activeDraftId) return
    const storedId = window.localStorage.getItem(ACTIVE_DRAFT_KEY)
    const storedDraft = routeDrafts.find((draft) => draft.id === storedId)
    if (storedDraft) {
      setActiveDraftId(storedDraft.id)
      setSnapToRoads(storedDraft.snapToRoads)
    }
  }, [activeDraftId, draftsReady, routeDrafts, setSnapToRoads])

  useEffect(() => {
    if (activeDraftId) window.localStorage.setItem(ACTIVE_DRAFT_KEY, activeDraftId)
    else window.localStorage.removeItem(ACTIVE_DRAFT_KEY)
  }, [activeDraftId])

  const patchDraft = (patch: Partial<RouteDraft>) => {
    if (!activeDraft) return
    updateRouteDraft({
      ...activeDraft,
      ...patch,
      updatedAt: new Date().toISOString()
    })
  }

  const startNewDraft = () => {
    const now = new Date().toISOString()
    const draft: RouteDraft = {
      id: `draft-${Date.now()}`,
      title: t('record.untitled'),
      note: '',
      points: [],
      segments: [],
      snapToRoads,
      syncState: 'local',
      createdAt: now,
      updatedAt: now
    }
    addRouteDraft(draft)
    setActiveDraftId(draft.id)
    setRecording(true)
    setSaved(false)
  }

  const continueDraft = (draft: RouteDraft) => {
    setActiveDraftId(draft.id)
    setSnapToRoads(draft.snapToRoads)
    setRecording(true)
    setComposer(null)
    setSaved(false)
  }

  const beginAddPoint = () => {
    void requestNetrinHeadingPermission()
    const fail = () => {
      setLocateFailed(true)
      setLocating(false)
    }
    setLocateFailed(false)
    setLocating(true)
    if (!navigator.geolocation) {
      fail()
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const raw: Coordinate = [position.coords.longitude, position.coords.latitude]
        const snapped = snapToRoads ? await snapPoint(raw) : { final: raw, snapped: false }
        const nextPoint: RecordedPoint = {
          id: `point-${Date.now()}`,
          index: points.length + 1,
          raw,
          final: snapped.final,
          accuracy: position.coords.accuracy,
          snapped: snapped.snapped,
          text: ''
        }
        setComposer({ point: nextPoint })
        setLocating(false)
      },
      fail,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    )
  }

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !composer) return
    setMediaError(false)
    try {
      const blob = await compressImage(file)
      const photoId = `route-photo-${Date.now()}`
      await saveMediaBlob(photoId, blob)
      if (composer.point.photoId && composer.point.photoId !== composer.originalPhotoId) {
        await removeMediaBlob(composer.point.photoId)
      }
      setComposer({
        ...composer,
        point: { ...composer.point, photoId }
      })
    } catch {
      setMediaError(true)
    }
    event.target.value = ''
  }

  const removeComposerPhoto = async () => {
    if (!composer?.point.photoId) return
    if (composer.point.photoId !== composer.originalPhotoId) {
      await removeMediaBlob(composer.point.photoId)
    }
    setComposer({ ...composer, point: { ...composer.point, photoId: undefined } })
  }

  const cancelComposer = async () => {
    if (composer?.point.photoId && composer.point.photoId !== composer.originalPhotoId) {
      await removeMediaBlob(composer.point.photoId)
    }
    setComposer(null)
  }

  const resetWorkspace = async () => {
    await cancelComposer()
    try {
      window.localStorage.removeItem(ACTIVE_DRAFT_KEY)
    } catch {
      // The in-memory reset still closes the workspace when localStorage is unavailable.
    }
    setActiveDraftId('')
    setRecording(false)
    setLocating(false)
    setLocateFailed(false)
    setSaved(false)
    setMediaError(false)
  }

  const savePoint = async () => {
    if (!composer || !activeDraft) return
    const existingIndex = points.findIndex((point) => point.id === composer.point.id)
    const nextPoints =
      existingIndex >= 0
        ? points.map((point) => (point.id === composer.point.id ? composer.point : point))
        : [...points, composer.point]
    const indexedPoints = reindex(nextPoints)
    const segments = await planSegmentsForPoints(indexedPoints)
    if (
      composer.originalPhotoId &&
      composer.originalPhotoId !== composer.point.photoId
    ) {
      await removeMediaBlob(composer.originalPhotoId)
    }
    patchDraft({ points: indexedPoints, segments, syncState: 'local', remoteId: undefined })
    setComposer(null)
  }

  const editPoint = (point: RecordedPoint) => {
    setComposer({ point: { ...point }, originalPhotoId: point.photoId })
    setRecording(true)
  }

  const deletePoint = async (point: RecordedPoint) => {
    if (point.photoId) await removeMediaBlob(point.photoId)
    const nextPoints = reindex(points.filter((item) => item.id !== point.id))
    const segments = await planSegmentsForPoints(nextPoints)
    patchDraft({
      points: nextPoints,
      segments,
      syncState: 'local',
      remoteId: undefined
    })
    if (composer?.point.id === point.id) setComposer(null)
  }

  const movePoint = async (pointId: string, direction: -1 | 1) => {
    const index = points.findIndex((point) => point.id === pointId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= points.length) return
    const next = [...points]
    ;[next[index], next[target]] = [next[target], next[index]]
    const nextPoints = reindex(next)
    const segments = await planSegmentsForPoints(nextPoints)
    patchDraft({ points: nextPoints, segments, syncState: 'local', remoteId: undefined })
  }

  const removeDraft = async (draft: RouteDraft) => {
    await Promise.all(
      draft.points
        .map((point) => point.photoId)
        .filter((photoId): photoId is string => Boolean(photoId))
        .map(removeMediaBlob)
    )
    removeRouteDraft(draft.id)
    if (activeDraftId === draft.id) {
      setActiveDraftId('')
      setRecording(false)
      setComposer(null)
    }
  }

  return (
    <section className="screen">
      <header className="screen-heading">
        <h1>{t('record.title')}</h1>
      </header>

      {!composer ? (
        <Panel variant="paper" shadow padding="0" style={{ overflow: 'hidden' }}>
          <div style={{ height: 220 }}>
            <NetrinMap
              route={routeCoords}
              routeSegments={routeSegments}
              stops={mapStops}
              locate
              mapStyleId={appearanceSettings.mapStyleId}
              recenterControl
              recenterLabel={t('home.followLocation')}
              compassLabel={t('home.resetNorth')}
              compactControls
            />
          </div>
        </Panel>
      ) : null}

      <Panel variant="dark" padding="14px">
        <div className="record-controls">
          <div className={`rec-status ${recording ? 'rec-status--on' : ''}`.trim()}>
            <PixelIcon name={recording ? 'play' : 'clock'} size={22} />
            <span className="rec-status__text">
              <b>{recording ? t('record.recordingOn') : t('record.recordingOff')}</b>
              <span>{t('record.status', { points: points.length, photos: photoCount })}</span>
            </span>
          </div>

          {!activeDraft ? (
            <Button block icon="play" onClick={startNewDraft}>
              {t('record.start')}
            </Button>
          ) : recording ? (
            <>
              {composer ? (
                <div className="kp-composer">
                  <div className="kp-composer__head">
                    <span className="kp-composer__title">
                      {t('record.keyPoint')} {composer.point.index}
                    </span>
                    <span className="kp-coords">
                      {composer.point.final[0].toFixed(5)}, {composer.point.final[1].toFixed(5)}
                    </span>
                  </div>

                  <div className="location-readout">
                    <span>
                      {composer.point.snapped ? t('record.snapped') : t('record.rawLocation')}
                    </span>
                    <span>
                      {t('record.accuracy', {
                        value: Math.round(composer.point.accuracy ?? 0)
                      })}
                    </span>
                  </div>
                  <p className="quiet">{t('record.editorMapHidden')}</p>

                  {composer.point.photoId ? (
                    <div className="kp-preview">
                      <StoredPhoto
                        photoId={composer.point.photoId}
                        alt={t('record.photo')}
                        className=""
                      />
                      <button
                        type="button"
                        className="kp-preview__remove"
                        aria-label={t('record.removePhoto')}
                        onClick={() => void removeComposerPhoto()}
                      >
                        <PixelIcon name="close" size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="nbtn nbtn--dark nbtn--block kp-pick">
                      <PixelIcon name="camera" size={18} />
                      <span>{t('record.addPhoto')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(event) => void pickPhoto(event)}
                      />
                    </label>
                  )}
                  {mediaError ? <p className="quiet">{t('record.photoUnavailable')}</p> : null}

                  <TextField
                    label={t('record.pointDesc')}
                    value={composer.point.text}
                    onChange={(text) =>
                      setComposer({
                        ...composer,
                        point: { ...composer.point, text }
                      })
                    }
                    multiline
                    rows={2}
                  />
                  <TextField
                    label={t('record.species')}
                    value={composer.point.speciesName ?? ''}
                    onChange={(speciesName) =>
                      setComposer({
                        ...composer,
                        point: { ...composer.point, speciesName }
                      })
                    }
                  />
                  <div className="rec-grid">
                    <Button variant="dark" icon="close" onClick={() => void cancelComposer()}>
                      {t('record.cancel')}
                    </Button>
                    <Button variant="solid" icon="check" onClick={() => void savePoint()}>
                      {t('record.saveKeyPoint')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button block icon="gps" disabled={locating} onClick={beginAddPoint}>
                    {locating ? t('record.locating') : t('record.markKeyPoint')}
                  </Button>
                  {locateFailed ? <p className="quiet">{t('record.locateUnavailable')}</p> : null}
                </>
              )}
              <Button
                block
                variant="dark"
                icon="flag"
                onClick={() => void resetWorkspace()}
              >
                {t('record.stop')}
              </Button>
            </>
          ) : (
            <Button block icon="play" onClick={() => setRecording(true)}>
              {t('record.resume')}
            </Button>
          )}

          <div className="rec-snap">
            <PixelIcon name="directions" size={22} />
            <span className="rec-snap__text">
              <b>{t('record.snap')}</b>
              <span>{snapToRoads ? t('record.snapOn') : t('record.snapOff')}</span>
            </span>
            <Switch
              checked={snapToRoads}
              onChange={(enabled) => {
                setSnapToRoads(enabled)
                if (activeDraft) patchDraft({ snapToRoads: enabled })
              }}
              label={t('record.snap')}
            />
          </div>
        </div>
      </Panel>

      <div className="stack">
        <h2 className="section-title">{t('record.recorded')}</h2>
        {points.length === 0 ? (
          <p className="quiet">{t('record.noPoints')}</p>
        ) : (
          <div className="timeline">
            {points.map((point, index) => (
              <div className="tl-item" key={point.id}>
                <div className="tl-rail">
                  <span className="tl-node">{point.index}</span>
                </div>
                <div className="tl-card">
                  {point.photoId ? (
                    <StoredPhoto
                      photoId={point.photoId}
                      alt={t('record.photo')}
                      className="tl-photo"
                    />
                  ) : null}
                  {point.text ? <p className="tl-text">{point.text}</p> : null}
                  {point.speciesName ? (
                    <span className="tl-species">{point.speciesName}</span>
                  ) : null}
                  <span className="tl-coords">
                    {point.final[0].toFixed(5)}, {point.final[1].toFixed(5)}
                    {point.snapped ? ` · ${t('record.snappedShort')}` : ''}
                  </span>
                  <div className="point-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="chevron-up"
                      disabled={index === 0}
                      aria-label={t('record.moveUp')}
                      onClick={() => void movePoint(point.id, -1)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="chevron-down"
                      disabled={index === points.length - 1}
                      aria-label={t('record.moveDown')}
                      onClick={() => void movePoint(point.id, 1)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="feather"
                      aria-label={t('record.editPoint')}
                      onClick={() => editPoint(point)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      aria-label={t('record.deletePoint')}
                      onClick={() => void deletePoint(point)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeDraft ? (
        <Panel variant="dark" padding="14px">
          <div className="record-meta">
            <TextField
              label={t('record.routeTitle')}
              value={activeDraft.title}
              onChange={(title) => patchDraft({ title, syncState: 'local', remoteId: undefined })}
              placeholder={t('record.untitled')}
            />
            <TextField
              label={t('record.note')}
              value={activeDraft.note}
              onChange={(note) => patchDraft({ note, syncState: 'local', remoteId: undefined })}
              multiline
            />
            <Button
              block
              variant="solid"
              icon="check"
              onClick={() => {
                patchDraft({ syncState: activeDraft.syncState === 'published' ? 'published' : 'local' })
                setSaved(true)
              }}
            >
              {t('record.saveDraft')}
            </Button>
          </div>
        </Panel>
      ) : null}

      {saved ? <p className="save-message">{t('record.saved')}</p> : null}

      <div className="stack">
        <h2 className="section-title">{t('record.latestDrafts')}</h2>
        {routeDrafts.length === 0 ? (
          <p className="quiet">{t('common.empty')}</p>
        ) : (
          <div className="draft-list">
            {routeDrafts.map((draft) => (
              <Panel key={draft.id} variant="dark" padding="12px">
                <div className="draft-row">
                  <div className="draft-row__body">
                    <b>{draft.title || t('record.untitled')}</b>
                    <span>
                      {t('record.draftSummary', {
                        points: draft.points.length,
                        photos: draft.points.filter((point) => point.photoId).length
                      })}
                    </span>
                  </div>
                  <Button size="sm" variant="solid" icon="play" onClick={() => continueDraft(draft)}>
                    {t('record.continue')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="delete"
                    aria-label={t('record.deleteDraft')}
                    onClick={() => void removeDraft(draft)}
                  />
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
