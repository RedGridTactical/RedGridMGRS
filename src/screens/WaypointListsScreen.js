/**
 * WaypointListsScreen — Pro feature.
 * Save named waypoint lists (e.g. "PATROL ROUTE", "OBJ SET ALPHA").
 * Up to 10 lists, 20 waypoints each. All stored locally, never transmitted.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView,
} from 'react-native';
import { TextInput } from '../components/FieldInput';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import { isFreshPosition } from '../utils/position';
import { Modal } from '../components/FieldModal';
import { toMGRS, formatMGRS, parseMGRSToLatLon } from '../utils/mgrs';
import { exportAsGPX, exportAsKML } from '../utils/gpxExport';
import { previewWaypointImport } from '../utils/gpxImport';
import { useColors } from '../utils/ThemeContext';
import { notifyWarning, notifySuccess, tapLight } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';
import { RouteCard } from '../components/RouteCard';
import { PreflightScreen } from './PreflightScreen';
import { calculateRoute, moveRoutePoint, parseRoutePlanInputs } from '../utils/routePlanner';
import { formatDistance } from '../utils/mgrs';
import { TYPE } from '../utils/typography';
import { copyTextToClipboard } from '../utils/clipboard';

let FileSystem; try { FileSystem = require('expo-file-system'); } catch {}
let Sharing; try { Sharing = require('expo-sharing'); } catch {}
let DocumentPicker; try { DocumentPicker = require('expo-document-picker'); } catch {}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function WaypointListsScreen({
  location, onSelectWaypoint, onStartRoute, activeRoute, navigationHistory = [],
  onClearNavigationHistory, onResumeNavigation, gpsSource, gpsDeviceName, mesh,
  savedLists = [], listsLoading = false, listsLoadError = false, listsSaveError = false, listsSaving = false,
  onRetryListsLoad, onRetryListsSave, onSaveList, onUpdateList, onDeleteList, selectedListId, onListRequestHandled, onSaveReviewNotes,
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [activeList,  setActiveList]  = useState(null); // list id
  const [newListName, setNewListName] = useState('');
  const [addingList,  setAddingList]  = useState(false);
  const [enteringGrid, setEnteringGrid] = useState(false);
  const [gridInput,    setGridInput]    = useState('');
  const [gridLabel,    setGridLabel]    = useState('');
  const [gridError,    setGridError]    = useState('');
  const [editingWpId,  setEditingWpId]  = useState(null);
  const [editMgrsInput, setEditMgrsInput] = useState('');
  const [copiedWpId,   setCopiedWpId]   = useState(null);
  const copiedTimer = useRef(null);
  const [routeCardVisible, setRouteCardVisible] = useState(false);
  const [preparedRoute, setPreparedRoute] = useState(null);
  const [reviewRoute, setReviewRoute] = useState(null);

  const [saveFailed, setSaveFailed] = useState(false);
  const writeBusy = useRef(false);
  const newListId = useRef(null);
  const [editLabel, setEditLabel] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editingPlan, setEditingPlan] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planPace, setPlanPace] = useState('');
  const [planStart, setPlanStart] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [planError, setPlanError] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const lists = savedLists;

  useEffect(() => {
    if (selectedListId && lists.some(list => list.id === selectedListId)) {
      setActiveList(selectedListId);
      onListRequestHandled?.();
      return;
    }
    // One effect decides selection so the default cannot overwrite a Map request
    // in the same commit before the parent clears that consumed request.
    if (!lists.some(list => list.id === activeList)) setActiveList(lists[0]?.id ?? null);
  }, [selectedListId, activeList, lists, onListRequestHandled]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const write = async operation => {
    if (writeBusy.current || listsLoading || listsLoadError) return false;
    writeBusy.current = true; setSaveFailed(false);
    try { await operation(); return true; }
    catch { setSaveFailed(true); notifyWarning(); return false; }
    finally { writeBusy.current = false; }
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    if (lists.length >= 10) { Alert.alert(t('waypoints.limitReached'), t('waypoints.maxLists')); return; }
    if (!newListId.current) newListId.current = uid();
    const newList = { id: newListId.current, name: newListName.trim().toUpperCase(), waypoints: [], createdAt: Date.now() };
    if (await write(() => onSaveList(newList))) {
      setNewListName(''); setAddingList(false); setActiveList(newList.id);
      newListId.current = null;
    }
  };
  const deleteList = id => Alert.alert(t('waypoints.deleteList'), t('waypoints.deleteListMsg'), [
    { text: t('waypoints.cancel'), style: 'cancel' },
    { text: t('waypoints.delete'), style: 'destructive', onPress: async () => {
      if (await write(() => onDeleteList(id))) { if (activeList === id) setActiveList(null); }
    } },
  ]);
  const appendPoint = (listId, point) => onUpdateList(listId, list => ({ ...list, waypoints: [...list.waypoints, point] }));
  const addCurrentPosition = async listId => {
    if (!isFreshPosition(location)) { Alert.alert(t('gps.noGpsFix'), t('gps.acquireFirst')); return; }
    const list = lists.find(item => item.id === listId);
    if (!list) return;
    if (list.waypoints.length >= 20) { Alert.alert(t('waypoints.limitReached'), t('waypoints.maxWaypoints')); return; }
    const point = { id: uid(), label: `WP ${list.waypoints.length + 1}`, lat: location.lat, lon: location.lon,
      mgrs: formatMGRS(toMGRS(location.lat, location.lon, 5)), source: 'gps', recordedAt: location.timestamp,
      accuracyM: Number.isFinite(location.accuracy) ? location.accuracy : null };
    await write(() => appendPoint(listId, point));
  };
  const addCustomGrid = async listId => {
    const parsed = parseMGRSToLatLon(gridInput.replace(/\s+/g, '').toUpperCase());
    if (!parsed) { notifyWarning(); setGridError(t('waypoints.invalidMgrs')); return; }
    const list = lists.find(item => item.id === listId);
    if (!list) return;
    if (list.waypoints.length >= 20) { Alert.alert(t('waypoints.limitReached'), t('waypoints.maxWaypoints')); return; }
    const point = { id: uid(), label: gridLabel.trim().toUpperCase() || `WP ${list.waypoints.length + 1}`,
      lat: parsed.lat, lon: parsed.lon, mgrs: formatMGRS(toMGRS(parsed.lat, parsed.lon, 5)), source: 'manual', recordedAt: Date.now() };
    if (await write(() => appendPoint(listId, point))) {
      setGridInput(''); setGridLabel(''); setGridError(''); setEnteringGrid(false);
    }
  };
  const deleteWaypoint = (listId, wpId) => Alert.alert(t('workflow.deletePoint'), t('workflow.deletePointBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('waypoints.delete'), style: 'destructive', onPress: () => write(() => onUpdateList(listId,
      list => ({ ...list, waypoints: list.waypoints.filter(point => point.id !== wpId) }))) },
  ]);
  const reorderWaypoint = (listId, wpId, direction) => write(() => onUpdateList(listId,
    list => ({ ...list, waypoints: moveRoutePoint(list.waypoints, wpId, direction) })));
  const startEditWaypoint = wp => {
    setEditingWpId(wp.id); setEditMgrsInput(wp.mgrs); setEditLabel(wp.label); setEditNote(wp.note || '');
  };
  const cancelEditWaypoint = () => { setEditingWpId(null); setEditMgrsInput(''); setGridError(''); };
  const saveEditWaypoint = async (listId, wpId) => {
    const parsed = parseMGRSToLatLon(editMgrsInput.replace(/\s+/g, '').toUpperCase());
    if (!parsed || !editLabel.trim()) { setGridError(t('waypoints.invalidMgrs')); return; }
    const mgrs = formatMGRS(toMGRS(parsed.lat, parsed.lon, 5));
    const saved = await write(() => onUpdateList(listId, list => ({ ...list, waypoints: list.waypoints.map(point => {
      if (point.id !== wpId) return point;
      // Preserve precise GPS/import coordinates if only label/note changed.
      const coordinateChanged = mgrs.replace(/\s/g, '') !== point.mgrs.replace(/\s/g, '');
      return { ...point, label: editLabel.trim().toUpperCase(), note: editNote.trim(),
        ...(coordinateChanged ? { lat: parsed.lat, lon: parsed.lon, mgrs, source: 'manual', recordedAt: Date.now(), accuracyM: null, provenance: null } : {}) };
    }) })));
    if (saved) { notifySuccess(); cancelEditWaypoint(); }
  };
  const openPlanEditor = () => {
    setPlanName(currentList.name); setPlanPace(currentList.paceMinPerKm == null ? '' : String(currentList.paceMinPerKm));
    setPlanStart(currentList.plannedStartAt ? new Date(currentList.plannedStartAt).toISOString().slice(0, 16).replace('T', ' ') : '');
    setPlanNotes(currentList.notes || ''); setPlanError(''); setEditingPlan(true);
  };
  const savePlan = async () => {
    let fields;
    try {
      if (!planName.trim()) throw new Error('name');
      fields = parseRoutePlanInputs({ pace: planPace, plannedStart: planStart, notes: planNotes });
    } catch { setPlanError(t('workflow.invalidPlan')); return; }
    if (await write(() => onUpdateList(currentList.id, list => ({ ...list, ...fields, name: planName.trim().toUpperCase() })))) setEditingPlan(false);
  };

  // ── Copy waypoint MGRS ──
  const copyWaypointMgrs = async (wp) => {
    try {
      await copyTextToClipboard(wp.mgrs);
      tapLight();
      setCopiedWpId(wp.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedWpId(null), 1500);
    } catch { Alert.alert(t('workflow.copyFailed'), t('workflow.copyRetry')); }
  };

  // ── Export list as GPX or KML ──
  const exportList = async (format) => {
    if (!(await allowSystemDisplay())) return;
    if (!currentList || currentList.waypoints.length === 0) {
      Alert.alert(t('waypoints.noWp'), t('waypoints.noWpMsg'));
      return;
    }
    try {
      const xml = format === 'kml'
        ? exportAsKML(currentList.waypoints, currentList.name, currentList)
        : exportAsGPX(currentList.waypoints, currentList.name, currentList);
      const ext = format === 'kml' ? 'kml' : 'gpx';
      const mime = format === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/gpx+xml';

      if (!FileSystem || !Sharing) {
        Alert.alert(t('waypoints.exportUnavailable'), t('waypoints.exportRequires'));
        return;
      }

      const path = `${FileSystem.cacheDirectory}${currentList.name.replace(/[^A-Z0-9]/gi, '_')}.${ext}`;
      await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert(t('waypoints.sharingUnavailable'), t('waypoints.sharingUnavailableMsg'));
        return;
      }
      await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: `Export ${currentList.name}` });
      notifySuccess();
    } catch (e) {
      Alert.alert(t('waypoints.exportFailed'), e.message || t('waypoints.exportFailedMsg'));
    }
  };

  const showExportMenu = () => {
    if (!currentList || currentList.waypoints.length === 0) {
      Alert.alert(t('waypoints.noWp'), t('waypoints.noWpMsg'));
      return;
    }
    Alert.alert(t('waypoints.exportFormat'), t('waypoints.exportFormatMsg', { name: currentList.name }), [
      { text: 'GPX', onPress: () => exportList('gpx') },
      { text: 'KML', onPress: () => exportList('kml') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Import waypoints from GPX/KML file ──
  const importFile = async () => {
    if (!(await allowSystemDisplay())) return;
    if (!currentList) return;
    try {
      if (!DocumentPicker || !FileSystem) {
        Alert.alert(t('waypoints.importUnavailable'), t('waypoints.importRequires'));
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'application/vnd.google-earth.kml+xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      const uri = file.uri;
      const name = (file.name || '').toLowerCase();

      const info = await FileSystem.getInfoAsync(uri);
      if ((file.size || info.size || 0) > 2 * 1024 * 1024) throw new Error(t('workflow.importTooLarge'));
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });

      const preview = previewWaypointImport(content, {
        format: name.endsWith('.kml') || content.includes('<kml') ? 'kml' : 'gpx',
        limit: Math.max(0, 20 - currentList.waypoints.length), existingPoints: currentList.waypoints,
      });
      setImportPreview({ ...preview, listId: currentList.id, fileName: file.name || '' });
    } catch (e) {
      Alert.alert(t('waypoints.importFailed'), e.message || t('waypoints.importError'));
    }
  };

  const confirmImport = async () => {
    if (!importPreview?.points?.length) return;
    const preview = importPreview;
    if (await write(() => onUpdateList(preview.listId, list => ({ ...list,
      ...(!list.waypoints.length && preview.plan ? { notes: preview.plan.notes, paceMinPerKm: preview.plan.paceMinPerKm, plannedStartAt: preview.plan.plannedStartAt } : {}),
      waypoints: [...list.waypoints, ...preview.points] })))) {
      setImportPreview(null); notifySuccess();
    }
  };
  const currentList = lists.find(l => l.id === activeList);
  const currentReview = reviewRoute ? navigationHistory.find(item => item.id === reviewRoute.id) || reviewRoute : null;

  const prepareRoute = () => {
    if (listsSaving || listsLoadError || !currentList) return;
    // Keep the prepared order stable if the underlying saved list later changes.
    const prepare = () => setPreparedRoute({ ...currentList, waypoints: currentList.waypoints.map(point => ({ ...point })) });
    if (!activeRoute) { prepare(); return; }
    Alert.alert(t('fieldNav.replaceTitle'), t('fieldNav.replaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('fieldNav.prepare'), onPress: prepare },
    ]);
  };

  const selectWaypoint = wp => {
    if (!activeRoute) { onSelectWaypoint?.(wp); return; }
    Alert.alert(t('fieldNav.replaceTitle'), t('fieldNav.replaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('waypoints.nav'), onPress: () => onSelectWaypoint?.(wp) },
    ]);
  };

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('waypoints.title')}</Text>
        <Text style={[styles.proTag, { color: colors.text2 }]}>{t('waypoints.pro')}</Text>
      </View>

      <Text style={[styles.flowHint, { color: colors.text3 }]}>{t('fieldNav.flow')}</Text>
      {(listsLoading || listsLoadError || listsSaveError || saveFailed || listsSaving) && <View style={[styles.routeAction, { borderColor: colors.border }]}>
        <Text accessibilityRole="alert" style={[styles.flowHint, { color: colors.text }]}>{listsLoading ? t('workflow.loadingPlans') : listsLoadError ? t('workflow.loadFailed') : listsSaving ? t('workflow.saving') : t('workflow.saveFailed')}</Text>
        {(listsLoadError || listsSaveError) && <TouchableOpacity onPress={listsLoadError ? onRetryListsLoad : onRetryListsSave} accessibilityRole="button" style={styles.clearHistory}><Text style={[styles.routeActionTitle, { color: colors.text2 }]}>{t('workflow.retry')}</Text></TouchableOpacity>}
      </View>}
      {activeRoute && (
        <TouchableOpacity style={[styles.routeAction, { borderColor: colors.accentText, backgroundColor: colors.card }]} onPress={onResumeNavigation} accessibilityRole="button">
          <Text style={[styles.routeActionTitle, { color: colors.accentText }]}>{t('fieldNav.resume')}</Text>
          <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('fieldNav.pointOf', { current: activeRoute.index + 1, total: activeRoute.waypoints.length, name: activeRoute.name })}</Text>
        </TouchableOpacity>
      )}

      {/* List selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.listTabs}>
        {lists.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[styles.listTab, { borderColor: colors.border2 }, activeList === l.id && { borderColor: colors.text2, backgroundColor: colors.text5 }]}
            onPress={() => setActiveList(l.id)}
            onLongPress={() => deleteList(l.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeList === l.id }}
            accessibilityLabel={`${l.name}, ${l.waypoints.length} of 20 waypoints`}
            accessibilityHint="Long press to delete list"
          >
            <Text style={[styles.listTabText, { color: colors.text3 }, activeList === l.id && { color: colors.text }]}>
              {l.name}
            </Text>
            <Text style={[styles.listTabCount, { color: colors.text3 }]}>{l.waypoints.length}/20</Text>
          </TouchableOpacity>
        ))}
        {lists.length < 10 && (
          <TouchableOpacity style={[styles.addListBtn, { borderColor: colors.border2 }]} onPress={() => setAddingList(true)} accessibilityRole="button" accessibilityLabel="Create new waypoint list">
            <Text style={[styles.addListBtnText, { color: colors.text3 }]}>{t('waypoints.newList')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* New list input */}
      {addingList && (
        <View style={styles.newListRow}>
          <TextInput
            style={[styles.newListInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="LIST NAME"
            placeholderTextColor={colors.text3}
            autoCapitalize="characters"
            autoFocus
            maxLength={80}
            onSubmitEditing={createList}
            accessibilityLabel="New list name"
          />
          <TouchableOpacity style={[styles.newListSave, { borderColor: colors.text2 }]} onPress={createList} accessibilityRole="button" accessibilityLabel="Create list">
            <Text style={[styles.newListSaveText, { color: colors.text2 }]}>{t('waypoints.create')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newListCancel} onPress={() => setAddingList(false)} accessibilityRole="button" accessibilityLabel="Cancel creating list">
            <Text style={[styles.newListCancelText, { color: colors.text3 }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Waypoints in active list */}
      {currentList ? (
        <View style={styles.wpSection}>
          <View style={styles.wpHeader}>
            <Text style={[styles.wpHeaderText, { color: colors.text3 }]}>{currentList.name} — {currentList.waypoints.length} {t('waypoints.waypoints')}</Text>
            <View style={styles.wpHeaderBtns}>
              <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.border }]} onPress={importFile} accessibilityRole="button" accessibilityLabel={t('waypoints.importLabel')}>
                <Text style={[styles.addWpBtnText, { color: colors.text3 }]}>{t('waypoints.import')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.border }]} onPress={showExportMenu} accessibilityRole="button" accessibilityLabel="Export waypoint list">
                <Text style={[styles.addWpBtnText, { color: colors.text3 }]}>{t('waypoints.export')}</Text>
              </TouchableOpacity>
              {currentList.waypoints.length >= 1 && (
                <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.text2 }]} onPress={() => setRouteCardVisible(true)} accessibilityRole="button" accessibilityLabel={t('routeCard.openLabel')}>
                  <Text style={[styles.addWpBtnText, { color: colors.text2 }]}>{t('routeCard.button')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.text2 }]} onPress={() => { setEnteringGrid(true); setGridError(''); }} accessibilityRole="button" accessibilityLabel="Enter MGRS grid manually">
                <Text style={[styles.addWpBtnText, { color: colors.text2 }]}>{t('waypoints.enterGrid')}</Text>
              </TouchableOpacity>
              {location && (
                <TouchableOpacity style={[styles.addWpBtn, styles.addPosBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={() => addCurrentPosition(currentList.id)} accessibilityRole="button" accessibilityLabel="Add current GPS position as waypoint">
                  <Text style={[styles.addWpBtnText, { color: colors.text }]}>{t('waypoints.markPos')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.wpHeaderBtns}>
            <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.text2 }]} onPress={openPlanEditor} accessibilityRole="button"><Text style={[styles.addWpBtnText, { color: colors.text2 }]}>{t('workflow.editPlan')}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.border }]} onPress={() => deleteList(currentList.id)} accessibilityRole="button"><Text style={[styles.addWpBtnText, { color: colors.text3 }]}>{t('waypoints.deleteList')}</Text></TouchableOpacity>
          </View>
          {editingPlan && <View style={[styles.gridEntryBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('workflow.routeName')}</Text>
            <TextInput value={planName} onChangeText={setPlanName} maxLength={80} accessibilityLabel={t('workflow.routeName')} style={[styles.gridEntryInput, { color: colors.text, borderColor: colors.border }]} />
            <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('workflow.pace')}</Text>
            <TextInput value={planPace} onChangeText={setPlanPace} keyboardType="decimal-pad" maxLength={6} accessibilityLabel={t('workflow.pace')} placeholder={t('workflow.optional')} placeholderTextColor={colors.text3} style={[styles.gridEntryInput, { color: colors.text, borderColor: colors.border }]} />
            <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('workflow.plannedStart')}</Text>
            <TextInput value={planStart} onChangeText={setPlanStart} maxLength={16} accessibilityLabel={t('workflow.plannedStart')} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={colors.text3} style={[styles.gridEntryInput, { color: colors.text, borderColor: colors.border }]} />
            <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('workflow.planNotes')}</Text>
            <TextInput value={planNotes} onChangeText={setPlanNotes} multiline maxLength={500} accessibilityLabel={t('workflow.planNotes')} style={[styles.gridEntryInput, { color: colors.text, borderColor: colors.border, minHeight: 80 }]} />
            {!!planError && <Text accessibilityRole="alert" style={[styles.flowHint, { color: colors.text }]}>{planError}</Text>}
            <TouchableOpacity onPress={savePlan} disabled={listsSaving} accessibilityRole="button" style={[styles.gridSaveBtn, { borderColor: colors.text2 }]}><Text style={[styles.gridSaveBtnText, { color: colors.text2 }]}>{t('waypoints.save')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingPlan(false)} accessibilityRole="button" style={styles.gridCancelBtn}><Text style={[styles.flowHint, { color: colors.text3 }]}>{t('common.cancel')}</Text></TouchableOpacity>
          </View>}

          {currentList.waypoints.length > 0 && onStartRoute && (
            <TouchableOpacity style={[styles.routeAction, { borderColor: colors.accentText, backgroundColor: colors.card }]} onPress={prepareRoute} accessibilityRole="button">
              <Text style={[styles.routeActionTitle, { color: colors.accentText }]}>{t('fieldNav.prepare')}</Text>
              <Text style={[styles.flowHint, { color: colors.text3 }]}>{t('fieldNav.listOrder')}</Text>
            </TouchableOpacity>
          )}

          {/* Manual MGRS grid entry */}
          {enteringGrid && (
            <View style={[styles.gridEntryBox, { borderColor: colors.border2, backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.gridEntryInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
                value={gridInput}
                onChangeText={t => { setGridInput(t); setGridError(''); }}
                placeholder="18S UJ 12345 67890"
                placeholderTextColor={colors.text3}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={20}
                accessibilityLabel="MGRS coordinate"
              />
              <TextInput
                style={[styles.gridLabelInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
                value={gridLabel}
                onChangeText={setGridLabel}
                placeholder="LABEL (OPTIONAL)"
                placeholderTextColor={colors.text3}
                autoCapitalize="characters"
                maxLength={16}
                accessibilityLabel="Waypoint label"
              />
              {gridError ? <Text style={[styles.gridError, { color: colors.text }]}>{gridError}</Text> : null}
              <View style={styles.gridEntryBtns}>
                <TouchableOpacity style={[styles.gridSaveBtn, { borderColor: colors.text2 }]} onPress={() => addCustomGrid(currentList.id)} accessibilityRole="button" accessibilityLabel="Add grid waypoint">
                  <Text style={[styles.gridSaveBtnText, { color: colors.text2 }]}>{t('waypoints.add')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.gridCancelBtn} onPress={() => { setEnteringGrid(false); setGridInput(''); setGridLabel(''); setGridError(''); }} accessibilityRole="button" accessibilityLabel="Cancel grid entry">
                  <Text style={[styles.gridCancelBtnText, { color: colors.text3 }]}>{t('waypoints.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {currentList.waypoints.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.text3 }]}>{t('waypoints.enterGrid')} · {t('waypoints.import')}</Text>
          )}

          {currentList.waypoints.map((wp, i) => (
            <View key={wp.id} style={[styles.wpRow, { borderColor: colors.border2, backgroundColor: colors.card }]}>
              {editingWpId === wp.id ? (
                <View style={styles.wpEditContainer}>
                  <TextInput value={editLabel} onChangeText={setEditLabel} maxLength={80} accessibilityLabel={t('workflow.pointLabel')} style={[styles.wpEditInput, { color: colors.text, borderColor: colors.border }]} />
                  <TextInput
                    style={[styles.wpEditInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
                    value={editMgrsInput}
                    onChangeText={setEditMgrsInput}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoFocus
                    maxLength={20}
                    onSubmitEditing={() => saveEditWaypoint(currentList.id, wp.id)}
                    accessibilityLabel="Edit MGRS coordinate"
                  />
                  <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('workflow.pointNote')}</Text>
                  <TextInput value={editNote} onChangeText={setEditNote} multiline maxLength={280} accessibilityLabel={t('workflow.pointNote')} style={[styles.wpEditInput, { color: colors.text, borderColor: colors.border }]} />
                  {!!gridError && <Text accessibilityRole="alert" style={[styles.flowHint, { color: colors.text }]}>{gridError}</Text>}
                  <View style={styles.wpEditBtns}>
                    <TouchableOpacity style={[styles.wpEditSave, { borderColor: colors.text2 }]} onPress={() => saveEditWaypoint(currentList.id, wp.id)} accessibilityRole="button" accessibilityLabel="Save edited coordinate">
                      <Text style={[styles.wpEditSaveText, { color: colors.text2 }]}>{t('waypoints.save')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.wpEditCancel} onPress={cancelEditWaypoint} accessibilityRole="button" accessibilityLabel={t('waypoints.cancel')}>
                      <Text style={[styles.wpEditCancelText, { color: colors.text3 }]}>{t('waypoints.cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.wpInfo}>
                    <Text style={[styles.wpLabel, { color: colors.text }]}>{i + 1}. {wp.label}</Text>
                    {!!wp.note && <Text style={[styles.flowHint, { color: colors.text3 }]}>{wp.note}</Text>}
                    <View style={styles.wpMgrsRow}>
                      <Text style={[styles.wpMgrs, { color: colors.text2 }]}>{wp.mgrs}</Text>
                      <TouchableOpacity style={[styles.wpCopyBtn, { borderColor: colors.border2 }]} onPress={() => copyWaypointMgrs(wp)} accessibilityRole="button" accessibilityLabel={`Copy ${wp.label} MGRS`}>
                        <Text style={[styles.wpCopyBtnText, { color: copiedWpId === wp.id ? colors.text2 : colors.text3 }]}>
                          {copiedWpId === wp.id ? t('waypoints.copied') : t('waypoints.copy')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.wpBtns}>
                    <TouchableOpacity style={[styles.wpNav, { borderColor: colors.border2, opacity: i === 0 ? 0.4 : 1 }]} disabled={i === 0 || listsSaving} onPress={() => reorderWaypoint(currentList.id, wp.id, -1)} accessibilityRole="button" accessibilityLabel={t('workflow.moveUpLabel', { name: wp.label })}><Text style={[styles.wpNavText, { color: colors.text2 }]}>{t('workflow.moveUp')}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.wpNav, { borderColor: colors.border2, opacity: i === currentList.waypoints.length - 1 ? 0.4 : 1 }]} disabled={i === currentList.waypoints.length - 1 || listsSaving} onPress={() => reorderWaypoint(currentList.id, wp.id, 1)} accessibilityRole="button" accessibilityLabel={t('workflow.moveDownLabel', { name: wp.label })}><Text style={[styles.wpNavText, { color: colors.text2 }]}>{t('workflow.moveDown')}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.wpNav, { borderColor: colors.border2 }]} onPress={() => startEditWaypoint(wp)} accessibilityRole="button" accessibilityLabel={`Edit ${wp.label} coordinate`}>
                      <Text style={[styles.wpNavText, { color: colors.text3 }]}>{t('waypoints.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.wpNav, { borderColor: colors.text2 }]} onPress={() => selectWaypoint(wp)} accessibilityRole="button" accessibilityLabel={`Navigate to ${wp.label}`}>
                      <Text style={[styles.wpNavText, { color: colors.text2 }]}>{t('waypoints.nav')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.wpDel} onPress={() => deleteWaypoint(currentList.id, wp.id)} accessibilityRole="button" accessibilityLabel={`Delete ${wp.label}`}>
                      <Text style={[styles.wpDelText, { color: colors.text3 }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.noList}>
          <Text style={[styles.noListText, { color: colors.text3 }]}>
            {lists.length === 0
              ? t('waypoints.createListPrompt')
              : t('waypoints.selectList')}
          </Text>
        </View>
      )}

      <Text style={[styles.hint, { color: colors.text3 }]}>{t('waypoints.hint')}</Text>

      {navigationHistory.length > 0 && (
        <View style={styles.history}>
          <Text style={[styles.routeActionTitle, { color: colors.text }]}>{t('fieldNav.recentRoutes')}</Text>
          <Text style={[styles.flowHint, { color: colors.text3 }]}>{t('fieldNav.reviewHint')}</Text>
          {navigationHistory.map(record => {
            const plannedDistance = calculateRoute(record.waypoints).totalDistance;
            return (
              <TouchableOpacity key={record.id} style={[styles.historyRow, { borderColor: colors.border2, backgroundColor: colors.card }]} onPress={() => setReviewRoute(record)} accessibilityRole="button">
                <Text style={[styles.routeActionTitle, { color: colors.text }]}>{record.name}</Text>
                <Text style={[styles.flowHint, { color: colors.text2 }]}>{t(`fieldNav.${record.status}`)} · {t('fieldNav.confirmedCount', { count: record.confirmed.length, total: record.waypoints.length })}</Text>
                <Text style={[styles.flowHint, { color: colors.text3 }]}>{new Date(record.endedAt).toLocaleString()} · {t('fieldNav.plannedDistance', { distance: formatDistance(plannedDistance) })}</Text>
              </TouchableOpacity>
            );
          })}
          {onClearNavigationHistory && (
            <TouchableOpacity style={styles.clearHistory} onPress={() => Alert.alert(t('fieldNav.clearHistory'), t('fieldNav.clearHistoryBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('fieldNav.clearHistory'), style: 'destructive', onPress: onClearNavigationHistory },
            ])} accessibilityRole="button">
              <Text style={[styles.flowHint, { color: colors.text3 }]}>{t('fieldNav.clearHistory')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <RouteCard visible={routeCardVisible} list={currentList} onClose={() => setRouteCardVisible(false)} />
      <RouteCard visible={!!reviewRoute} list={currentReview} onClose={() => setReviewRoute(null)} onSaveReviewNotes={onSaveReviewNotes} />
      <Modal visible={!!importPreview} transparent animationType="slide" onRequestClose={() => setImportPreview(null)}>
        <View style={[styles.importBackdrop, { backgroundColor: colors.bg + 'F2' }]}><ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>{t('workflow.importPreview')}</Text>
          <Text style={[styles.flowHint, { color: colors.text2 }]}>{importPreview?.fileName}</Text>
          <Text style={[styles.flowHint, { color: colors.text }]}>{t('workflow.importCounts', importPreview?.counts || {})}</Text>
          {!!importPreview?.warnings?.length && <Text accessibilityRole="alert" style={[styles.flowHint, { color: colors.text }]}>{t('workflow.multiplePlans')}</Text>}
          {importPreview?.plan && <Text style={[styles.flowHint, { color: colors.text2 }]}>{t('workflow.importPlanHint')} · {importPreview.plan.name}</Text>}
          {(importPreview?.points || []).map((point, index) => <Text key={point.id || index} style={[styles.flowHint, { color: colors.text2 }]}>{index + 1}. {point.label} · {point.mgrs}</Text>)}
          <TouchableOpacity disabled={!importPreview?.points?.length || listsSaving} style={[styles.routeAction, { borderColor: colors.text2 }]} onPress={confirmImport} accessibilityRole="button"><Text style={[styles.routeActionTitle, { color: colors.text }]}>{t('workflow.confirmImport')}</Text></TouchableOpacity>
          {(saveFailed || listsSaveError) && <Text accessibilityRole="alert" style={[styles.flowHint, { color: colors.text }]}>{t('workflow.saveFailed')}</Text>}
          <TouchableOpacity style={styles.clearHistory} onPress={() => setImportPreview(null)} accessibilityRole="button"><Text style={[styles.flowHint, { color: colors.text3 }]}>{t('common.cancel')}</Text></TouchableOpacity>
        </ScrollView></View>
      </Modal>
      <PreflightScreen visible={!!preparedRoute} onClose={() => setPreparedRoute(null)}
        location={location} gpsSource={gpsSource} gpsDeviceName={gpsDeviceName} mesh={mesh}
        isPro preparedRoute={preparedRoute}
        onStartNavigation={mode => {
          const routeToStart = preparedRoute;
          setPreparedRoute(null);
          onStartRoute?.(routeToStart, mode);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  importBackdrop: { flex: 1, paddingTop: 60 },
  flowHint: { ...TYPE.body, fontSize: 14, lineHeight: 19 },
  routeAction: { borderWidth: 1, padding: 12, marginVertical: 12, gap: 5, minHeight: 48 },
  routeActionTitle: { ...TYPE.heading, fontSize: 15, letterSpacing: 0.7 },
  history: { marginTop: 18, gap: 8 },
  historyRow: { borderWidth: 1, padding: 12, gap: 5 },
  clearHistory: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { ...TYPE.heading, fontSize: 20, letterSpacing: 1.2 },
  proTag: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

  listTabs: { flexGrow: 0, marginBottom: 12 },
  listTab: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, alignItems: 'center' },
  listTabText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  listTabCount: { ...TYPE.data, fontSize: 11, letterSpacing: 0.6, marginTop: 2 },
  addListBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderStyle: 'dashed' },
  addListBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

  newListRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  newListInput: { flex: 1, borderWidth: 1, ...TYPE.body, fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  newListSave: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  newListSaveText: { ...TYPE.label, fontSize: 11 },
  newListCancel: { paddingHorizontal: 12, paddingVertical: 8 },
  newListCancelText: { fontSize: 14 },

  wpSection: { gap: 8 },
  wpHeader: { marginBottom: 6, gap: 8 },
  wpHeaderText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  addWpBtn: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  addWpBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  addPosBtn: { borderWidth: 1 },
  emptyText: { ...TYPE.body, fontSize: 12, textAlign: 'center', paddingVertical: 20, lineHeight: 17 },

  wpRow: { gap: 10, borderWidth: 1, padding: 10 },
  wpInfo: { gap: 3 },
  wpLabel: { ...TYPE.heading, fontSize: 14, letterSpacing: 1.2, paddingVertical: 0 },
  wpMgrs: { ...TYPE.data, fontSize: 11, letterSpacing: 0.6 },
  wpMgrsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wpCopyBtn: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  wpCopyBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1 },
  wpBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wpNav: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpNavText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  wpDel: { paddingHorizontal: 8, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpDelText: { fontSize: 12 },
  wpEditContainer: { flex: 1, gap: 6 },
  wpEditInput: { borderWidth: 1, ...TYPE.data, fontSize: 14, letterSpacing: 0.6, paddingHorizontal: 10, paddingVertical: 6 },
  wpEditBtns: { flexDirection: 'row', gap: 8 },
  wpEditSave: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpEditSaveText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  wpEditCancel: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpEditCancelText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

  wpHeaderBtns: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  gridEntryBox: { borderWidth: 1, padding: 10, gap: 8, marginBottom: 8 },
  gridEntryInput: { borderWidth: 1, ...TYPE.data, fontSize: 16, letterSpacing: 0.6, paddingHorizontal: 10, paddingVertical: 8 },
  gridLabelInput: { borderWidth: 1, ...TYPE.body, fontSize: 12, letterSpacing: 0.3, paddingHorizontal: 10, paddingVertical: 6 },
  gridError: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3, textAlign: 'center' },
  gridEntryBtns: { flexDirection: 'row', gap: 8 },
  gridSaveBtn: { flex: 1, borderWidth: 1, paddingVertical: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  gridSaveBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  gridCancelBtn: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  gridCancelBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

  noList: { paddingVertical: 30, alignItems: 'center' },
  noListText: { ...TYPE.label, fontSize: 11, textAlign: 'center', letterSpacing: 1.2, lineHeight: 16 },
  hint: { ...TYPE.body, marginTop: 20, fontSize: 12, letterSpacing: 0.3, textAlign: 'center' },
});
