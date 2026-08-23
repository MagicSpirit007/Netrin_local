import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/core/Button'
import { TextField } from '../components/forms/TextField'
import { NetrinMap } from '../components/domain/NetrinMap'
import { PixelIcon } from '../components/icons/PixelIcon'
import { Panel } from '../components/surfaces/Panel'
import { publishRouteDraft, type PublishResult } from '../data/routeLibrary'
import { removeMediaBlob } from '../data/drafts'
import { textFor } from '../data/nature'
import type {
  Coordinate,
  DownloadedRoute,
  DownloadedStop,
  MapStyleId,
  RouteDraft
} from '../data/types'
import { NETRIN_LANGUAGE_KEY } from '../i18n'
import { routeLineFromSegments } from '../lib/routing/routeSegments'
import { useNetrinState } from '../state/NetrinState'

const ACTIVE_DRAFT_KEY = 'netrin.activeRouteDraft'

type ProfileView = 'menu' | 'language' | 'downloads' | 'downloadDetail' | 'offline' | 'appearance'
type UploadNotice = Exclude<PublishResult, { ok: true }>['error'] | 'success'

const MAP_STYLE_OPTIONS: MapStyleId[] = [
  'field-console',
  'campus-atlas',
  'forest-walk',
  'night-trace'
]

function getPhotoCount(draft: RouteDraft) {
  return draft.points.filter((point) => point.photoId).length
}

function getCurrentLanguage(language: string) {
  return language.startsWith('en') ? 'en' : 'zh-CN'
}

function uploadNoticeKey(notice: UploadNotice) {
  return `profile.upload.${notice}`
}

function localizedFromInput(value: string) {
  return { 'zh-CN': value, en: value }
}

function cloneDownloadedRoute(route: DownloadedRoute): DownloadedRoute {
  return {
    ...route,
    title: { ...route.title },
    description: { ...route.description },
    season: { ...route.season },
    difficulty: { ...route.difficulty },
    tags: [...route.tags],
    waypoints: route.waypoints.map((point) => [...point] as Coordinate),
    segments: route.segments.map((segment) => ({
      ...segment,
      coordinates: segment.coordinates.map((point) => [...point] as Coordinate),
      snapDistanceMeters: segment.snapDistanceMeters
        ? { ...segment.snapDistanceMeters }
        : undefined,
      parts: segment.parts?.map((part) => ({
        ...part,
        coordinates: part.coordinates.map((point) => [...point] as Coordinate)
      }))
    })),
    stops: route.stops.map((stop) => ({
      ...stop,
      location: [...stop.location] as Coordinate,
      title: { ...stop.title },
      description: { ...stop.description }
    }))
  }
}

function reindexStops(stops: DownloadedStop[]): DownloadedStop[] {
  return stops.map((stop, index) => ({ ...stop, order: index + 1 }))
}

function previewRouteLine(route: DownloadedRoute): Coordinate[] {
  return routeLineFromSegments(
    route.segments,
    route.waypoints.length >= 2 ? route.waypoints : route.stops.map((stop) => stop.location)
  )
}

export function ProfileScreen() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const {
    activeRouteId,
    appearanceSettings,
    downloadedRoutes,
    removeDownload,
    removeRouteDraft,
    routeDrafts,
    setActiveRouteId,
    setSnapToRoads,
    updateAppearanceSettings,
    updateDownloadedRoute,
    updateRouteDraft
  } = useNetrinState()
  const [view, setView] = useState<ProfileView>('menu')
  const [uploadNotices, setUploadNotices] = useState<Record<string, UploadNotice>>({})
  const [selectedDownloadId, setSelectedDownloadId] = useState<string | null>(null)
  const [editingDownload, setEditingDownload] = useState(false)
  const [downloadEditDraft, setDownloadEditDraft] = useState<DownloadedRoute | null>(null)

  const currentLanguage = getCurrentLanguage(i18n.language)
  const selectedDownload = useMemo(
    () => downloadedRoutes.find((route) => route.id === selectedDownloadId),
    [downloadedRoutes, selectedDownloadId]
  )
  const visibleDownload = editingDownload && downloadEditDraft ? downloadEditDraft : selectedDownload

  useEffect(() => {
    if (view !== 'downloadDetail' || !selectedDownloadId || selectedDownload) return
    setView('downloads')
    setSelectedDownloadId(null)
    setEditingDownload(false)
    setDownloadEditDraft(null)
  }, [selectedDownload, selectedDownloadId, view])

  const continueDraft = (draft: RouteDraft) => {
    try {
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, draft.id)
    } catch {
      // The Create screen can still open with its in-memory state.
    }
    setSnapToRoads(draft.snapToRoads)
    navigate('/create')
  }

  const deleteDraft = async (draft: RouteDraft) => {
    await Promise.all(
      draft.points
        .map((point) => point.photoId)
        .filter((photoId): photoId is string => Boolean(photoId))
        .map(removeMediaBlob)
    )
    removeRouteDraft(draft.id)
    setUploadNotices((current) => {
      const next = { ...current }
      delete next[draft.id]
      return next
    })
    try {
      if (window.localStorage.getItem(ACTIVE_DRAFT_KEY) === draft.id) {
        window.localStorage.removeItem(ACTIVE_DRAFT_KEY)
      }
    } catch {
      // Ignore localStorage failures; the in-memory draft list is already updated.
    }
  }

  const changeLanguage = (language: 'zh-CN' | 'en') => {
    void i18n.changeLanguage(language)
    try {
      window.localStorage.setItem(NETRIN_LANGUAGE_KEY, language)
    } catch {
      // Language still changes for this session.
    }
  }

  const activateDownloadedRoute = (id: string) => {
    setActiveRouteId(id)
    navigate('/')
  }

  const deleteDownloadedRoute = (id: string) => {
    removeDownload(id)
    if (activeRouteId === id) setActiveRouteId('')
    if (selectedDownloadId === id) {
      setSelectedDownloadId(null)
      setEditingDownload(false)
      setDownloadEditDraft(null)
      setView('downloads')
    }
  }

  const openDownloadDetail = (id: string) => {
    setSelectedDownloadId(id)
    setEditingDownload(false)
    setDownloadEditDraft(null)
    setView('downloadDetail')
  }

  const startDownloadEdit = () => {
    if (!selectedDownload) return
    setDownloadEditDraft(cloneDownloadedRoute(selectedDownload))
    setEditingDownload(true)
  }

  const cancelDownloadEdit = () => {
    setEditingDownload(false)
    setDownloadEditDraft(null)
  }

  const saveDownloadEdit = () => {
    if (!selectedDownload || !downloadEditDraft) return
    updateDownloadedRoute(selectedDownload.id, {
      title: downloadEditDraft.title,
      description: downloadEditDraft.description,
      stops: reindexStops(downloadEditDraft.stops)
    })
    setEditingDownload(false)
    setDownloadEditDraft(null)
  }

  const updateDownloadDraft = (updater: (route: DownloadedRoute) => DownloadedRoute) => {
    setDownloadEditDraft((current) => (current ? updater(current) : current))
  }

  const updateDownloadStop = (
    stopId: string,
    updater: (stop: DownloadedStop) => DownloadedStop
  ) => {
    updateDownloadDraft((route) => ({
      ...route,
      stops: route.stops.map((stop) => (stop.id === stopId ? updater(stop) : stop))
    }))
  }

  const moveDownloadStop = (stopId: string, direction: -1 | 1) => {
    updateDownloadDraft((route) => {
      const index = route.stops.findIndex((stop) => stop.id === stopId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= route.stops.length) return route
      const stops = [...route.stops]
      const [stop] = stops.splice(index, 1)
      stops.splice(target, 0, stop)
      return { ...route, stops: reindexStops(stops) }
    })
  }

  const deleteDownloadStop = (stopId: string) => {
    updateDownloadDraft((route) => ({
      ...route,
      stops: reindexStops(route.stops.filter((stop) => stop.id !== stopId))
    }))
  }

  const handleBack = () => {
    if (view === 'downloadDetail') {
      if (editingDownload) {
        cancelDownloadEdit()
        return
      }
      setView('downloads')
      setSelectedDownloadId(null)
      return
    }
    setView('menu')
  }

  const uploadDraft = async (draft: RouteDraft) => {
    if (draft.points.length < 2) {
      setUploadNotices((current) => ({ ...current, [draft.id]: 'invalid' }))
      return
    }

    const now = new Date().toISOString()
    updateRouteDraft({ ...draft, syncState: 'uploading', updatedAt: now })
    setUploadNotices((current) => {
      const next = { ...current }
      delete next[draft.id]
      return next
    })

    const result = await publishRouteDraft(draft, t('record.untitled'))
    if (result.ok) {
      updateRouteDraft({
        ...draft,
        syncState: 'published',
        remoteId: result.id,
        updatedAt: new Date().toISOString()
      })
      setUploadNotices((current) => ({ ...current, [draft.id]: 'success' }))
    } else {
      updateRouteDraft({
        ...draft,
        syncState: 'failed',
        updatedAt: new Date().toISOString()
      })
      setUploadNotices((current) => ({ ...current, [draft.id]: result.error }))
    }
  }

  const renderHeader = (title: string, subtitle?: string) => (
    <header className="screen-heading">
      <div className="screen-head-row">
        <h1>{title}</h1>
        {view !== 'menu' ? (
          <Button variant="dark" size="sm" icon="arrow-left" onClick={handleBack}>
            {t('profile.back')}
          </Button>
        ) : null}
      </div>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  )

  if (view === 'language') {
    return (
      <section className="screen">
        {renderHeader(t('profile.language'), t('profile.languageHint'))}
        <Panel variant="dark" padding="12px">
          <div className="profile-choice-list">
            <Button
              block
              variant={currentLanguage === 'zh-CN' ? 'solid' : 'dark'}
              icon={currentLanguage === 'zh-CN' ? 'check' : 'languages'}
              onClick={() => changeLanguage('zh-CN')}
            >
              {t('profile.languageChinese')}
            </Button>
            <Button
              block
              variant={currentLanguage === 'en' ? 'solid' : 'dark'}
              icon={currentLanguage === 'en' ? 'check' : 'languages'}
              onClick={() => changeLanguage('en')}
            >
              {t('profile.languageEnglish')}
            </Button>
          </div>
        </Panel>
      </section>
    )
  }

  if (view === 'downloads') {
    return (
      <section className="screen">
        {renderHeader(t('profile.downloadedRoutes'), t('profile.downloadRoutesHint'))}
        {downloadedRoutes.length === 0 ? (
          <Panel variant="dark">
            <p className="quiet">{t('profile.noDownloads')}</p>
          </Panel>
        ) : (
          <div className="profile-asset-list">
            {downloadedRoutes.map((route) => (
              <Panel key={route.id} variant="dark" padding="12px">
                  <div className="profile-asset">
                  <button
                    type="button"
                    className="profile-asset__head profile-asset__open"
                    onClick={() => openDownloadDetail(route.id)}
                  >
                    <span className="profile-asset__icon">
                      <PixelIcon name="download" size={22} />
                    </span>
                    <span className="profile-asset__body">
                      <b>{textFor(route.title, i18n.language)}</b>
                      <span>
                        {t('profile.routeSummary', {
                          stops: route.stops.length,
                          author: route.author || t('profile.unknownAuthor')
                        })}
                      </span>
                    </span>
                    <PixelIcon name="chevron-right" size={18} />
                  </button>
                  <div className="profile-asset__actions">
                    <Button
                      size="sm"
                      variant="solid"
                      icon="home"
                      onClick={() => activateDownloadedRoute(route.id)}
                    >
                      {t('profile.setCurrentRoute')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      onClick={() => deleteDownloadedRoute(route.id)}
                    >
                      {t('profile.removeDownload')}
                    </Button>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </section>
    )
  }

  if (view === 'downloadDetail') {
    const route = visibleDownload
    const routeTitle = route ? textFor(route.title, i18n.language) : t('profile.downloadDetail')
    const routeDescription = route ? textFor(route.description, i18n.language) : ''

    return (
      <section className="screen">
        {renderHeader(t('profile.downloadDetail'), routeTitle)}
        {!route ? (
          <Panel variant="dark">
            <p className="quiet">{t('profile.noDownloads')}</p>
          </Panel>
        ) : (
          <div className="profile-detail">
            <Panel variant="dark" padding="12px">
              <div className="profile-detail__head">
                <div>
                  <span className="profile-pill">
                    {route.isLocalEdited ? t('profile.downloadLocalBadge') : t('profile.downloadCloudBadge')}
                  </span>
                  <h2>{routeTitle}</h2>
                  {routeDescription ? <p>{routeDescription}</p> : null}
                </div>
              </div>
              <div className="profile-detail__meta">
                {route.distance ? <span>{route.distance}</span> : null}
                {route.duration ? <span>{route.duration}</span> : null}
                <span>{t('profile.downloadStops', { stops: route.stops.length })}</span>
                <span>{route.author || t('profile.unknownAuthor')}</span>
              </div>
              <div className="profile-asset__actions profile-asset__actions--three">
                {editingDownload ? (
                  <>
                    <Button size="sm" variant="solid" icon="check" onClick={saveDownloadEdit}>
                      {t('profile.saveDownloadEdit')}
                    </Button>
                    <Button size="sm" variant="dark" icon="close" onClick={cancelDownloadEdit}>
                      {t('profile.cancelEdit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      onClick={() => deleteDownloadedRoute(route.id)}
                    >
                      {t('profile.removeDownload')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="solid"
                      icon="home"
                      onClick={() => activateDownloadedRoute(route.id)}
                    >
                      {t('profile.useEditedRoute')}
                    </Button>
                    <Button size="sm" variant="dark" icon="feather" onClick={startDownloadEdit}>
                      {t('profile.editDownload')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      onClick={() => deleteDownloadedRoute(route.id)}
                    >
                      {t('profile.removeDownload')}
                    </Button>
                  </>
                )}
              </div>
            </Panel>

            <section
              className="profile-map-preview"
              aria-label={t('profile.routePreview')}
            >
              <NetrinMap
                route={previewRouteLine(route)}
                routeSegments={route.segments}
                stops={route.stops.map((stop, index) => ({
                  id: stop.id,
                  location: stop.location,
                  index: index + 1,
                  label: textFor(stop.title, i18n.language)
                }))}
                activeStopId={route.stops[0]?.id}
                framed
                interactive={false}
                locate={false}
                recenterControl={false}
                showCompass={false}
                mapStyleId={appearanceSettings.mapStyleId}
              />
            </section>

            {editingDownload ? (
              <Panel variant="dark" padding="12px">
                <div className="profile-editor">
                  <TextField
                    label={t('profile.routeTitle')}
                    value={routeTitle}
                    onChange={(value) =>
                      updateDownloadDraft((draft) => ({ ...draft, title: localizedFromInput(value) }))
                    }
                  />
                  <TextField
                    label={t('profile.routeDescription')}
                    value={routeDescription}
                    multiline
                    rows={3}
                    onChange={(value) =>
                      updateDownloadDraft((draft) => ({
                        ...draft,
                        description: localizedFromInput(value)
                      }))
                    }
                  />
                </div>
              </Panel>
            ) : null}

            <div className="profile-stop-list">
              {route.stops.map((stop, index) => {
                const stopTitle = textFor(stop.title, i18n.language)
                const stopDescription = textFor(stop.description, i18n.language)
                return (
                  <div key={stop.id} className="profile-stop">
                    <div className="profile-stop__head">
                      <span className="profile-stop__index">{index + 1}</span>
                      <b>{stopTitle}</b>
                    </div>
                    {stop.photoUrl ? (
                      <img
                        className="profile-stop__photo"
                        src={stop.photoUrl}
                        alt={t('home.stopPhoto', { title: stopTitle })}
                        loading="lazy"
                      />
                    ) : null}
                    {editingDownload ? (
                      <>
                        <TextField
                          label={t('profile.stopNote')}
                          value={stopDescription}
                          multiline
                          rows={2}
                          onChange={(value) =>
                            updateDownloadStop(stop.id, (current) => ({
                              ...current,
                              description: localizedFromInput(value)
                            }))
                          }
                        />
                        <TextField
                          label={t('profile.speciesName')}
                          value={stop.speciesName ?? ''}
                          onChange={(value) =>
                            updateDownloadStop(stop.id, (current) => ({
                              ...current,
                              speciesName: value.trim() || undefined
                            }))
                          }
                        />
                        <div className="profile-stop__actions">
                          <Button
                            size="sm"
                            variant="dark"
                            icon="chevron-up"
                            disabled={index === 0}
                            onClick={() => moveDownloadStop(stop.id, -1)}
                          >
                            {t('profile.moveStopUp')}
                          </Button>
                          <Button
                            size="sm"
                            variant="dark"
                            icon="chevron-down"
                            disabled={index === route.stops.length - 1}
                            onClick={() => moveDownloadStop(stop.id, 1)}
                          >
                            {t('profile.moveStopDown')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="delete"
                            onClick={() => deleteDownloadStop(stop.id)}
                          >
                            {t('profile.deleteStop')}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        {stop.speciesName ? (
                          <p className="profile-stop__species">
                            <span>{t('profile.speciesName')}</span>
                            <b>{stop.speciesName}</b>
                          </p>
                        ) : null}
                        {stopDescription ? <p>{stopDescription}</p> : null}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    )
  }

  if (view === 'offline') {
    return (
      <section className="screen">
        {renderHeader(t('profile.offline'), t('profile.offlineHint'))}
        {routeDrafts.length === 0 ? (
          <Panel variant="dark">
            <p className="quiet">{t('profile.noDrafts')}</p>
          </Panel>
        ) : (
          <div className="profile-asset-list">
            {routeDrafts.map((draft) => {
              const notice = uploadNotices[draft.id]
              return (
                <Panel key={draft.id} variant="dark" padding="12px">
                  <div className="profile-asset">
                    <div className="profile-asset__head">
                      <span className="profile-asset__icon">
                        <PixelIcon name="directions" size={22} />
                      </span>
                      <span className="profile-asset__body">
                        <b>{draft.title || t('record.untitled')}</b>
                        <span>
                          {t('profile.draftSummary', {
                            points: draft.points.length,
                            photos: getPhotoCount(draft)
                          })}
                        </span>
                      </span>
                      <span className="profile-pill">{t(`profile.sync.${draft.syncState}`)}</span>
                    </div>
                    <div className="profile-asset__actions profile-asset__actions--three">
                      <Button
                        size="sm"
                        variant="dark"
                        icon="feather"
                        onClick={() => continueDraft(draft)}
                      >
                        {t('profile.continueDraft')}
                      </Button>
                      <Button
                        size="sm"
                        variant="solid"
                        icon="cloud"
                        disabled={draft.syncState === 'uploading' || draft.points.length < 2}
                        onClick={() => void uploadDraft(draft)}
                      >
                        {draft.syncState === 'uploading'
                          ? t('workshop.uploading')
                          : draft.syncState === 'failed'
                            ? t('workshop.retryUpload')
                            : t('profile.uploadDraft')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="delete"
                        onClick={() => void deleteDraft(draft)}
                      >
                        {t('profile.deleteDraft')}
                      </Button>
                    </div>
                    {notice ? (
                      <p className={notice === 'success' ? 'save-message' : 'quiet'}>
                        {t(uploadNoticeKey(notice))}
                      </p>
                    ) : null}
                  </div>
                </Panel>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  if (view === 'appearance') {
    return (
      <section className="screen">
        {renderHeader(t('profile.appearance'), t('profile.appearanceHint'))}
        <div className="profile-settings-list">
          <Panel variant="dark" padding="12px">
            <div className="profile-settings-group">
              <h2>{t('profile.mapStyle')}</h2>
              <div className="profile-option-grid">
                {MAP_STYLE_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    variant={appearanceSettings.mapStyleId === option ? 'solid' : 'dark'}
                    icon={appearanceSettings.mapStyleId === option ? 'check' : 'eye'}
                    onClick={() => updateAppearanceSettings({ mapStyleId: option })}
                  >
                    {t(`profile.mapStyles.${option}`)}
                  </Button>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </section>
    )
  }

  return (
    <section className="screen">
      {renderHeader(t('profile.title'))}
      <div className="profile-menu">
        <Button block size="lg" variant="paper" icon="languages" onClick={() => setView('language')}>
          {t('profile.language')}
        </Button>
        <Button block size="lg" variant="paper" icon="download" onClick={() => setView('downloads')}>
          {t('profile.downloadRoutes')}
        </Button>
        <Button block size="lg" variant="paper" icon="lock" onClick={() => setView('offline')}>
          {t('profile.offline')}
        </Button>
        <Button block size="lg" variant="paper" icon="eye" onClick={() => setView('appearance')}>
          {t('profile.appearance')}
        </Button>
      </div>
    </section>
  )
}
