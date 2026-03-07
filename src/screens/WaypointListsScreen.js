/**
 * WaypointListsScreen — Pro feature.
 * Save named waypoint lists (e.g. "PATROL ROUTE", "OBJ SET ALPHA").
 * Up to 10 lists, 20 waypoints each. All stored locally, never transmitted.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert,
} from 'react-native';
import { loadWaypointLists, saveWaypointLists } from '../utils/storage';
import { toMGRS, formatMGRS } from '../utils/mgrs';
import { useColors } from '../utils/ThemeContext';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function WaypointListsScreen({ location, onSelectWaypoint }) {
  const colors = useColors();
  const [lists,       setLists]       = useState([]);
  const [activeList,  setActiveList]  = useState(null); // list id
  const [newListName, setNewListName] = useState('');
  const [addingList,  setAddingList]  = useState(false);

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
    if (lists.length >= 10) { Alert.alert('Limit reached', 'Maximum 10 waypoint lists.'); return; }
    const newList = { id: uid(), name: newListName.trim().toUpperCase(), waypoints: [] };
    const updated = [...lists, newList];
    persist(updated).catch(() => {});
    setNewListName('');
    setAddingList(false);
    setActiveList(newList.id);
  };

  // ── Delete list ──
  const deleteList = (id) => {
    Alert.alert('Delete list?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const updated = lists.filter(l => l.id !== id);
        persist(updated).catch(() => {});
        if (activeList === id) setActiveList(null);
      }},
    ]);
  };

  // ── Add current position as waypoint ──
  const addCurrentPosition = (listId) => {
    if (!location) { Alert.alert('No GPS fix', 'Acquire a position first.'); return; }
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    if (list.waypoints.length >= 20) { Alert.alert('Limit reached', 'Maximum 20 waypoints per list.'); return; }
    const mgrs = formatMGRS(toMGRS(location.lat, location.lon, 5));
    const wp = { id: uid(), label: `WP ${list.waypoints.length + 1}`, lat: location.lat, lon: location.lon, mgrs };
    const updated = lists.map(l => l.id === listId ? { ...l, waypoints: [...l.waypoints, wp] } : l);
    persist(updated).catch(() => {});
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

  const currentList = lists.find(l => l.id === activeList);

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>WAYPOINT LISTS</Text>
        <Text style={[styles.proTag, { color: colors.text2 }]}>◈ PRO</Text>
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
            <Text style={[styles.addListBtnText, { color: colors.border }]}>+ NEW</Text>
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
            <Text style={[styles.newListSaveText, { color: colors.text2 }]}>CREATE</Text>
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
            <Text style={[styles.wpHeaderText, { color: colors.border }]}>{currentList.name} — {currentList.waypoints.length} WAYPOINTS</Text>
            {location && (
              <TouchableOpacity style={[styles.addWpBtn, { borderColor: colors.text2 }]} onPress={() => addCurrentPosition(currentList.id)} accessibilityRole="button" accessibilityLabel="Mark current position as waypoint">
                <Text style={[styles.addWpBtnText, { color: colors.text2 }]}>+ MARK POSITION</Text>
              </TouchableOpacity>
            )}
          </View>

          {currentList.waypoints.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.text4 }]}>NO WAYPOINTS — TAP MARK POSITION TO ADD YOUR CURRENT GRID</Text>
          )}

          {currentList.waypoints.map((wp, i) => (
            <View key={wp.id} style={[styles.wpRow, { borderColor: colors.border2, backgroundColor: colors.card }]}>
              <View style={styles.wpInfo}>
                <TextInput
                  style={[styles.wpLabel, { color: colors.text }]}
                  value={wp.label}
                  onChangeText={t => renameWaypoint(currentList.id, wp.id, t)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel={`Waypoint ${i + 1} label`}
                />
                <Text style={[styles.wpMgrs, { color: colors.text2 }]}>{wp.mgrs}</Text>
              </View>
              <View style={styles.wpBtns}>
                <TouchableOpacity style={[styles.wpNav, { borderColor: colors.text2 }]} onPress={() => onSelectWaypoint?.(wp)} accessibilityRole="button" accessibilityLabel={`Navigate to ${wp.label}`}>
                  <Text style={[styles.wpNavText, { color: colors.text2 }]}>NAV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.wpDel} onPress={() => deleteWaypoint(currentList.id, wp.id)} accessibilityRole="button" accessibilityLabel={`Delete ${wp.label}`}>
                  <Text style={[styles.wpDelText, { color: colors.border }]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.noList}>
          <Text style={[styles.noListText, { color: colors.text4 }]}>
            {lists.length === 0
              ? 'CREATE A LIST TO SAVE WAYPOINTS BETWEEN SESSIONS'
              : 'SELECT A LIST ABOVE'}
          </Text>
        </View>
      )}

      <Text style={[styles.hint, { color: colors.text4 }]}>LONG-PRESS A LIST TAB TO DELETE · WAYPOINTS STORED LOCALLY ONLY</Text>
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
  addListBtnText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },

  newListRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  newListInput: { flex: 1, borderWidth: 1, fontFamily: 'monospace', fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  newListSave: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  newListSaveText: { fontFamily: 'monospace', fontSize: 10 },
  newListCancel: { paddingHorizontal: 12, paddingVertical: 8 },
  newListCancelText: { fontFamily: 'monospace', fontSize: 14 },

  wpSection: { gap: 8 },
  wpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  wpHeaderText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  addWpBtn: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  addWpBtnText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  emptyText: { fontFamily: 'monospace', fontSize: 9, textAlign: 'center', paddingVertical: 20, lineHeight: 16 },

  wpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, padding: 10 },
  wpInfo: { flex: 1, gap: 3 },
  wpLabel: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 3, paddingVertical: 0 },
  wpMgrs: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },
  wpBtns: { flexDirection: 'row', gap: 6 },
  wpNav: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpNavText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  wpDel: { paddingHorizontal: 8, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  wpDelText: { fontFamily: 'monospace', fontSize: 12 },

  noList: { paddingVertical: 30, alignItems: 'center' },
  noListText: { fontFamily: 'monospace', fontSize: 9, textAlign: 'center', letterSpacing: 2, lineHeight: 16 },
  hint: { marginTop: 20, fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, textAlign: 'center' },
});
