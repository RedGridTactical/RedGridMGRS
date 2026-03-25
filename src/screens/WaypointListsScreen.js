/**
 * WaypointListsScreen — Pro feature.
 * Save named waypoint lists (e.g. "PATROL ROUTE", "OBJ SET ALPHA").
 * Up to 10 lists, 20 waypoints each. All stored locally, never transmitted.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert,
} from 'react-native';
import { loadWaypointLists, saveWaypointLists } from '../utils/storage';
import { toMGRS, formatMGRS, parseMGRSToLatLon } from '../utils/mgrs';
import { exportAsGPX, exportAsKML } from '../utils/gpxExport';
import { useColors } from '../utils/ThemeContext';
import { notifyWarning, notifySuccess, tapLight } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';

let Clipboard; try { Clipboard = require('expo-clipboard'); } catch {}
let FileSystem; try { FileSystem = require('expo-file-system'); } catch {}
let Sharing; try { Sharing = require('expo-sharing'); } catch {}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function WaypointListsScreen({ location, onSelectWaypoint }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [lists,       setLists]       = useState([]);
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

  useEffect(() => {
    loadWaypointLists().then(setLists).catch(() => {});
  }, []);

  const persist = useCallback(async (updated) => {
    await saveWaypointLists(updated).catch(() => {});
    setLists(updated);
  }, []);

  // ── Create list ──
  const createList = () => {
    if (!newListName.trim()) return;
    if (lists.length >= 10) { Alert.alert(t('waypoints.limitReached'), t('waypoints.maxLists')); return; }
    const newList = { id: uid(), name: newListName.trim().toUpperCase(), waypoints: [] };
    const updated = [...lists, newList];
    persist(updated).catch(() => {});
    setNewListName('');
    setAddingList(false);
    setActiveList(newList.id);
  };

  // ── Delete list ──
  const deleteList = (id) => {
    Alert.alert(t('waypoints.deleteList'), t('waypoints.deleteListMsg'), [
      { text: t('waypoints.cancel'), style: 'cancel' },
      { text: t('waypoints.delete'), style: 'destructive', onPress: () => {
        const updated = lists.filter(l => l.id !== id);
        persist(updated).catch(() => {});
        if (activeList === id) setActiveList(null);
      }},
    ]);
  };

  // ── Add current position as waypoint ──
  const addCurrentPosition = (listId) => {
    if (!location) { Alert.alert(t('gps.noGpsFix'), t('gps.acquireFirst')); return; }
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    if (list.waypoints.length >= 20) { Alert.alert(t('waypoints.limitReached'), t('waypoints.maxWaypoints')); return; }
    const mgrs = formatMGRS(toMGRS(location.lat, location.lon, 5));
    const wp = { id: uid(), label: `WP ${list.waypoints.length + 1}`, lat: location.lat, lon: location.lon, mgrs };
    const updated = lists.map(l => l.id === listId ? { ...l, waypoints: [...l.waypoints, wp] } : l);
    persist(updated).catch(() => {});
  };

  // ── Add custom MGRS grid as waypoint ──
  const addCustomGrid = (listId) => {
    const cleaned = gridInput.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 6) { notifyWarning(); setGridError(t('waypoints.invalidMgrs')); return; }
    const parsed = parseMGRSToLatLon(cleaned);
    if (!parsed) { notifyWarning(); setGridError(t('waypoints.couldNotParse')); return; }
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    if (list.waypoints.length >= 20) { Alert.alert(t('waypoints.limitReached'), t('waypoints.maxWaypoints')); return; }
    const mgrs = formatMGRS(toMGRS(parsed.lat, parsed.lon, 5));
    const wp = { id: uid(), label: gridLabel.trim().toUpperCase() || `WP ${list.waypoints.length + 1}`, lat: parsed.lat, lon: parsed.lon, mgrs };
    const updated = lists.map(l => l.id === listId ? { ...l, waypoints: [...l.waypoints, wp] } : l);
    persist(updated).catch(() => {});
    setGridInput(''); setGridLabel(''); setGridError(''); setEnteringGrid(false);
  };

  // ── Rename waypoint ──
  const renameWaypoint = (listId, wpId, newLabel) => {
    const updated = lists.map(l => l.id !== listId ? l : {
      ...l,
      waypoints: l.waypoints.map(w => w.id === wpId ? { ...w, label: newLabel.toUpperCase() } : w),
    });
    persist(updated).catch(() => {});
  };

  // ── Delete waypoint ──
  const deleteWaypoint = (listId, wpId) => {
    const updated = lists.map(l => l.id !== listId ? l : {
      ...l, waypoints: l.waypoints.filter(w => w.id !== wpId),
    });
    persist(updated).catch(() => {});
  };

  // ── Edit waypoint MGRS ──
  const startEditWaypoint = (wp) => {
    setEditingWpId(wp.id);
    setEditMgrsInput(wp.mgrs);
  };

  const cancelEditWaypoint = () => {
    setEditingWpId(null);
    setEditMgrsInput('');
  };

  const saveEditWaypoint = (listId, wpId) => {
    try {
      const cleaned = editMgrsInput.replace(/\s+/g, '').toUpperCase();
      if (!cleaned) { cancelEditWaypoint(); return; }
      const parsed = parseMGRSToLatLon(cleaned);
      if (!parsed) { notifyWarning(); return; }
      const mgrs = formatMGRS(toMGRS(parsed.lat, parsed.lon, 5));
      const updated = lists.map(l => l.id !== listId ? l : {
        ...l,
        waypoints: l.waypoints.map(w => w.id === wpId ? { ...w, lat: parsed.lat, lon: parsed.lon, mgrs } : w),
      });
      persist(updated).catch(() => {});
      notifySuccess();
      setEditingWpId(null);
      setEditMgrsInput('');
    } catch { notifyWarning(); }
  };

  // ── Copy waypoint MGRS ──
  const copyWaypointMgrs = async (wp) => {
    try {
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(wp.mgrs);
      } else if (Clipboard?.setString) {
        Clipboard.setString(wp.mgrs);
      }
      tapLight();
      setCopiedWpId(wp.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedWpId(null), 1500);
    } catch {}
  };

  // ── Export list as GPX or KML ──
  const exportList = async (format) => {
    if (!currentList || currentList.waypoints.length === 0) {
      Alert.alert('No Waypoints', 'Add waypoints before exporting.');
      return;
    }
    try {
      const xml = format === 'kml'
        ? exportAsKML(currentList.waypoints, currentList.name)
        : exportAsGPX(currentList.waypoints, currentList.name);
      const ext = format === 'kml' ? 'kml' : 'gpx';
      const mime = format === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/gpx+xml';

      if (!FileSystem || !Sharing) {
        Alert.alert('Export Unavailable', 'expo-file-system and expo-sharing are required for export.');
        return;
      }

      const path = `${FileSystem.cacheDirectory}${currentList.name.replace(/[^A-Z0-9]/gi, '_')}.${ext}`;
      await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: `Export ${currentList.name}` });
      notifySuccess();
    } catch (e) {
      Alert.alert('Export Failed', e.message || 'Could not export waypoints.');
    }
  };

  const showExportMenu = () => {
    if (!currentList || currentList.waypoints.length === 0) {
      Alert.alert('No Waypoints', 'Add waypoints before exporting.');
      return;
    }
    Alert.alert('Export Format', `Export "${currentList.name}" as:`, [
      { text: 'GPX', onPress: () => exportList('gpx') },
      { text: 'KML', onPress: () => exportList('kml') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const currentList = lists.find(l => l.id === activeList);

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('waypoints.title')}</Text>
        <Text style={[styles.proTag, { color: colors.text2 }]}>{t('waypoints.pro')}</Text>
      </View>

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
            <Text style={[styles.listTabText, { color: colors.border }, activeList === l.id && { color: colors.text }]}>
              {l.name}
            </Text>
            <Text style={[styles.listTabCount, { color: colors.text4 }]}>{l.waypoints.length}/20</Text>
          </TouchableOpacity>
        ))}
        {lists.length < 10 && (
          <TouchableOpacity style={[styles.addListBtn, { borderColor: colors.border2 }]} onPress={() => setAddingList(true)} accessibilityRole="button" accessibilityLabel="Create new waypoint list">
            <Text style={[styles.addListBtnText, { color: colors.border }]}>{t('waypoints.newList')}</Text>
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
            placeholderTextColor={colors.text4}
            autoCapitalize="characters"
            autoFocus
            onSubmitEditing={createList}
            accessibilityLabel="New list name"
          />
          <TouchableOpacity style={[styles.newListSave, { borderColor: colors.text2 }]} onPress={createList} accessibilityRole="button" accessibilityLabel="Create list">
            <Text style={[styles.newListSaveText, { color: colors.text2 }]}>{t('waypoints.create')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newListCancel} onPress={() => setAddingList(false)} accessibilityRole="button" accessibilityLabel="Cancel creating list">
            <Text style={[styles.newListCancelText, { color: colors.border }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Waypoints in active list */}
      {currentList ? (
        <View style={styles.wpSection}>
          <View style={styles.wpHeader}>
            <Text style={[styles.wpHeaderText, { color: colors.border }]}>{currentList.name} — {currentList.waypoints.length} {t('waypoints.waypoints')}</Text>
            <View style={styles.wpHeaderBtns}>
              <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.border }]} onPress={showExportMenu} accessibilityRole="button" accessibilityLabel="Export waypoint list">
                <Text style={[styles.addWpBtnText, { color: colors.border }]}>EXPORT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.text2 }]} onPress={() => { setEnteringGrid(true); setGridError(''); }} accessibilityRole="button" accessibilityLabel="Enter MGRS grid manually">
                <Text style={[styles.addWpBtnText, { color: colors.text2 }]}>{t('waypoints.enterGrid')}</Text>
              </TouchableOpacity>
              {location && (
                <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.border }]} onPress={() => addCurrentPosition(currentList.id)} accessibilityRole="button" accessibilityLabel="Mark current position as waypoint">
                  <Text style={[styles.addWpBtnText, { color: colors.border }]}>{t('waypoints.markPos')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Manual MGRS grid entry */}
          {enteringGrid && (
            <View style={[styles.gridEntryBox, { borderColor: colors.border2, backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.gridEntryInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
                value={gridInput}
                onChangeText={t => { setGridInput(t); setGridError(''); }}
                placeholder="18S UJ 12345 67890"
                placeholderTextColor={colors.text4}
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
                placeholderTextColor={colors.text4}
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
                  <Text style={[styles.gridCancelBtnText, { color: colors.border }]}>{t('waypoints.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {currentList.waypoints.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.text4 }]}>{t('waypoints.noWaypoints')}</Text>
          )}

          {currentList.waypoints.map((wp, i) => (
            <View key={wp.id} style={[styles.wpRow, { borderColor: colors.border2, backgroundColor: colors.card }]}>
              {editingWpId === wp.id ? (
                <View style={styles.wpEditContainer}>
                  <Text style={[styles.wpLabel, { color: colors.text }]}>{wp.label}</Text>
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
                  <View style={styles.wpEditBtns}>
                    <TouchableOpacity style={[styles.wpEditSave, { borderColor: colors.text2 }]} onPress={() => saveEditWaypoint(currentList.id, wp.id)} accessibilityRole="button" accessibilityLabel="Save edited coordinate">
                      <Text style={[styles.wpEditSaveText, { color: colors.text2 }]}>{t('waypoints.save')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.wpEditCancel} onPress={cancelEditWaypoint} accessibilityRole="button" accessibilityLabel={t('waypoints.cancel')}>
                      <Text style={[styles.wpEditCancelText, { color: colors.border }]}>{t('waypoints.cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.wpInfo}>
                    <TextInput
                      style={[styles.wpLabel, { color: colors.text }]}
                      value={wp.label}
                      onChangeText={t => renameWaypoint(currentList.id, wp.id, t)}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      accessibilityLabel={`Waypoint ${i + 1} label`}
                    />
                    <View style={styles.wpMgrsRow}>
                      <Text style={[styles.wpMgrs, { color: colors.text2 }]}>{wp.mgrs}</Text>
                      <TouchableOpacity style={[styles.wpCopyBtn, { borderColor: colors.border2 }]} onPress={() => copyWaypointMgrs(wp)} accessibilityRole="button" accessibilityLabel={`Copy ${wp.label} MGRS`}>
                        <Text style={[styles.wpCopyBtnText, { color: copiedWpId === wp.id ? colors.text2 : colors.border }]}>
                          {copiedWpId === wp.id ? t('waypoints.copied') : t('waypoints.copy')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.wpBtns}>
                    <TouchableOpacity style={[styles.wpNav, { borderColor: colors.border2 }]} onPress={() => startEditWaypoint(wp)} accessibilityRole="button" accessibilityLabel={`Edit ${wp.label} coordinate`}>
                      <Text style={[styles.wpNavText, { color: colors.border }]}>{t('waypoints.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.wpNav, { borderColor: colors.text2 }]} onPress={() => onSelectWaypoint?.(wp)} accessibilityRole="button" accessibilityLabel={`Navigate to ${wp.label}`}>
                      <Text style={[styles.wpNavText, { color: colors.text2 }]}>{t('waypoints.nav')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.wpDel} onPress={() => deleteWaypoint(currentList.id, wp.id)} accessibilityRole="button" accessibilityLabel={`Delete ${wp.label}`}>
                      <Text style={[styles.wpDelText, { color: colors.border }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.noList}>
          <Text style={[styles.noListText, { color: colors.text4 }]}>
            {lists.length === 0
              ? t('waypoints.createListPrompt')
              : t('waypoints.selectList')}
          </Text>
        </View>
      )}

      <Text style={[styles.hint, { color: colors.text4 }]}>{t('waypoints.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', letterSpacing: 4 },
  proTag: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },

  listTabs: { flexGrow: 0, marginBottom: 12 },
  listTab: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, alignItems: 'center' },
  listTabText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  listTabCount: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, marginTop: 2 },
  addListBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderStyle: 'dashed' },
  addListBtnText: { fontSize: 9, letterSpacing: 2 },

  newListRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  newListInput: { flex: 1, borderWidth: 1, fontFamily: 'monospace', fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  newListSave: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  newListSaveText: { fontSize: 10 },
  newListCancel: { paddingHorizontal: 12, paddingVertical: 8 },
  newListCancelText: { fontSize: 14 },

  wpSection: { gap: 8 },
  wpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  wpHeaderText: { fontSize: 9, letterSpacing: 2 },
  addWpBtn: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  addWpBtnText: { fontSize: 9, letterSpacing: 2 },
  emptyText: { fontSize: 9, textAlign: 'center', paddingVertical: 20, lineHeight: 16 },

  wpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, padding: 10 },
  wpInfo: { flex: 1, gap: 3 },
  wpLabel: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 3, paddingVertical: 0 },
  wpMgrs: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },
  wpMgrsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wpCopyBtn: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  wpCopyBtnText: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 1 },
  wpBtns: { flexDirection: 'row', gap: 6 },
  wpNav: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpNavText: { fontSize: 9, letterSpacing: 2 },
  wpDel: { paddingHorizontal: 8, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpDelText: { fontSize: 12 },
  wpEditContainer: { flex: 1, gap: 6 },
  wpEditInput: { borderWidth: 1, fontFamily: 'monospace', fontSize: 14, letterSpacing: 3, paddingHorizontal: 10, paddingVertical: 6 },
  wpEditBtns: { flexDirection: 'row', gap: 8 },
  wpEditSave: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpEditSaveText: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  wpEditCancel: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpEditCancelText: { fontSize: 10, letterSpacing: 2 },

  wpHeaderBtns: { flexDirection: 'row', gap: 6 },

  gridEntryBox: { borderWidth: 1, padding: 10, gap: 8, marginBottom: 8 },
  gridEntryInput: { borderWidth: 1, fontFamily: 'monospace', fontSize: 16, letterSpacing: 4, paddingHorizontal: 10, paddingVertical: 8 },
  gridLabelInput: { borderWidth: 1, fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, paddingHorizontal: 10, paddingVertical: 6 },
  gridError: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, textAlign: 'center' },
  gridEntryBtns: { flexDirection: 'row', gap: 8 },
  gridSaveBtn: { flex: 1, borderWidth: 1, paddingVertical: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  gridSaveBtnText: { fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  gridCancelBtn: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  gridCancelBtnText: { fontSize: 10, letterSpacing: 2 },

  noList: { paddingVertical: 30, alignItems: 'center' },
  noListText: { fontSize: 9, textAlign: 'center', letterSpacing: 2, lineHeight: 16 },
  hint: { marginTop: 20, fontSize: 10, letterSpacing: 1, textAlign: 'center' },
});
