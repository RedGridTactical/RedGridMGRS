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

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function WaypointListsScreen({ location, onSelectWaypoint }) {
  const [lists,       setLists]       = useState([]);
  const [activeList,  setActiveList]  = useState(null); // list id
  const [newListName, setNewListName] = useState('');
  const [addingList,  setAddingList]  = useState(false);

  useEffect(() => {
    loadWaypointLists().then(setLists);
  }, []);

  const persist = useCallback(async (updated) => {
    await saveWaypointLists(updated);
    setLists(updated);
  }, []);

  // ── Create list ──
  const createList = () => {
    if (!newListName.trim()) return;
    if (lists.length >= 10) { Alert.alert('Limit reached', 'Maximum 10 waypoint lists.'); return; }
    const newList = { id: uid(), name: newListName.trim().toUpperCase(), waypoints: [] };
    const updated = [...lists, newList];
    persist(updated);
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
        persist(updated);
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
    persist(updated);
  };

  // ── Rename waypoint ──
  const renameWaypoint = (listId, wpId, newLabel) => {
    const updated = lists.map(l => l.id !== listId ? l : {
      ...l,
      waypoints: l.waypoints.map(w => w.id === wpId ? { ...w, label: newLabel.toUpperCase() } : w),
    });
    persist(updated);
  };

  // ── Delete waypoint ──
  const deleteWaypoint = (listId, wpId) => {
    const updated = lists.map(l => l.id !== listId ? l : {
      ...l, waypoints: l.waypoints.filter(w => w.id !== wpId),
    });
    persist(updated);
  };

  const currentList = lists.find(l => l.id === activeList);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>WAYPOINT LISTS</Text>
        <Text style={styles.proTag}>◈ PRO</Text>
      </View>

      {/* List selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.listTabs}>
        {lists.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[styles.listTab, activeList === l.id && styles.listTabActive]}
            onPress={() => setActiveList(l.id)}
            onLongPress={() => deleteList(l.id)}
          >
            <Text style={[styles.listTabText, activeList === l.id && styles.listTabTextActive]}>
              {l.name}
            </Text>
            <Text style={styles.listTabCount}>{l.waypoints.length}/20</Text>
          </TouchableOpacity>
        ))}
        {lists.length < 10 && (
          <TouchableOpacity style={styles.addListBtn} onPress={() => setAddingList(true)}>
            <Text style={styles.addListBtnText}>+ NEW</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* New list input */}
      {addingList && (
        <View style={styles.newListRow}>
          <TextInput
            style={styles.newListInput}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="LIST NAME"
            placeholderTextColor="#3A0000"
            autoCapitalize="characters"
            autoFocus
            onSubmitEditing={createList}
          />
          <TouchableOpacity style={styles.newListSave} onPress={createList}>
            <Text style={styles.newListSaveText}>CREATE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newListCancel} onPress={() => setAddingList(false)}>
            <Text style={styles.newListCancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Waypoints in active list */}
      {currentList ? (
        <View style={styles.wpSection}>
          <View style={styles.wpHeader}>
            <Text style={styles.wpHeaderText}>{currentList.name} — {currentList.waypoints.length} WAYPOINTS</Text>
            {location && (
              <TouchableOpacity style={styles.addWpBtn} onPress={() => addCurrentPosition(currentList.id)}>
                <Text style={styles.addWpBtnText}>+ MARK POSITION</Text>
              </TouchableOpacity>
            )}
          </View>

          {currentList.waypoints.length === 0 && (
            <Text style={styles.emptyText}>NO WAYPOINTS — TAP MARK POSITION TO ADD YOUR CURRENT GRID</Text>
          )}

          {currentList.waypoints.map((wp, i) => (
            <View key={wp.id} style={styles.wpRow}>
              <View style={styles.wpInfo}>
                <TextInput
                  style={styles.wpLabel}
                  value={wp.label}
                  onChangeText={t => renameWaypoint(currentList.id, wp.id, t)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text style={styles.wpMgrs}>{wp.mgrs}</Text>
              </View>
              <View style={styles.wpBtns}>
                <TouchableOpacity style={styles.wpNav} onPress={() => onSelectWaypoint?.(wp)}>
                  <Text style={styles.wpNavText}>NAV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.wpDel} onPress={() => deleteWaypoint(currentList.id, wp.id)}>
                  <Text style={styles.wpDelText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.noList}>
          <Text style={styles.noListText}>
            {lists.length === 0
              ? 'CREATE A LIST TO SAVE WAYPOINTS BETWEEN SESSIONS'
              : 'SELECT A LIST ABOVE'}
          </Text>
        </View>
      )}

      <Text style={styles.hint}>LONG-PRESS A LIST TAB TO DELETE · WAYPOINTS STORED LOCALLY ONLY</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', letterSpacing: 4, color: RED },
  proTag: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: RED2 },

  listTabs: { flexGrow: 0, marginBottom: 12 },
  listTab: { borderWidth: 1, borderColor: RED4, paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, alignItems: 'center' },
  listTabActive: { borderColor: RED2, backgroundColor: RED5 },
  listTabText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3, fontWeight: '700' },
  listTabTextActive: { color: RED },
  listTabCount: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: RED4, marginTop: 2 },
  addListBtn: { borderWidth: 1, borderColor: RED4, paddingHorizontal: 12, paddingVertical: 8, borderStyle: 'dashed' },
  addListBtnText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3 },

  newListRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  newListInput: { flex: 1, borderWidth: 1, borderColor: RED3, backgroundColor: '#110000', color: RED, fontFamily: 'monospace', fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  newListSave: { borderWidth: 1, borderColor: RED2, paddingHorizontal: 12, paddingVertical: 8 },
  newListSaveText: { fontFamily: 'monospace', fontSize: 10, color: RED2 },
  newListCancel: { paddingHorizontal: 12, paddingVertical: 8 },
  newListCancelText: { fontFamily: 'monospace', fontSize: 14, color: RED3 },

  wpSection: { gap: 8 },
  wpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  wpHeaderText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3 },
  addWpBtn: { borderWidth: 1, borderColor: RED2, paddingHorizontal: 10, paddingVertical: 6 },
  addWpBtnText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED2 },
  emptyText: { fontFamily: 'monospace', fontSize: 9, color: RED4, textAlign: 'center', paddingVertical: 20, lineHeight: 16 },

  wpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: RED4, backgroundColor: '#0D0000', padding: 10 },
  wpInfo: { flex: 1, gap: 3 },
  wpLabel: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 3, color: RED, paddingVertical: 0 },
  wpMgrs: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: RED2 },
  wpBtns: { flexDirection: 'row', gap: 6 },
  wpNav: { borderWidth: 1, borderColor: RED2, paddingHorizontal: 10, paddingVertical: 6 },
  wpNavText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED2 },
  wpDel: { paddingHorizontal: 8, paddingVertical: 6 },
  wpDelText: { fontFamily: 'monospace', fontSize: 12, color: RED3 },

  noList: { paddingVertical: 30, alignItems: 'center' },
  noListText: { fontFamily: 'monospace', fontSize: 9, color: RED4, textAlign: 'center', letterSpacing: 2, lineHeight: 16 },
  hint: { marginTop: 20, fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: RED4, textAlign: 'center' },
});
