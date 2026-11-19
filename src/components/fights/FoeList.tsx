import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MobDef } from '@/game/types';

import { EnemyTags } from '../EnemyTags';

/** The Foes tab: each foe with its families and armour, then anything the fight adds (its tags, its trophy). */
export function FoeList({ foes, children }: { foes: MobDef[]; children?: ReactNode }) {
  return (
    <View style={styles.list}>
      {foes.map((mob) => (
        <EnemyTags key={mob.id} mob={mob} />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: 8 } });
