import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { ParchmentCard, WoodButton } from '@/components/ui';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';
import { fonts, ui } from '@/theme';

import { alegreyaLicence } from '../../../assets/licenses/alegreya-ofl';

type Credit = {
  id: string;
  name: string;
  lines: string[];
  licence?: string;
};

/** One credited asset: what it is, and its licence when we have one. */
function CreditCard({ credit, expanded, onToggle }: { credit: Credit; expanded: boolean; onToggle: () => void }) {
  return (
    <ParchmentCard title={credit.name} contentStyle={styles.card}>
      {credit.lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      {credit.licence !== undefined && (
        <>
          <WoodButton
            title={expanded ? t('settings.hideLicence') : t('settings.showLicence')}
            compact
            onPress={onToggle}
          />
          {expanded && <Text style={styles.licence}>{credit.licence}</Text>}
        </>
      )}
    </ParchmentCard>
  );
}

/** The licences for the assets that ship with the app. */
export default function CreditsScreen() {
  useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const credits: Credit[] = [
    {
      id: 'alegreya',
      name: 'Alegreya',
      lines: [
        'Copyright 2011 The Alegreya Project Authors (https://github.com/huertatipografica/Alegreya)',
        'SIL Open Font License 1.1',
      ],
      licence: alegreyaLicence,
    },
    { id: 'fantaisie', name: 'Fantaisie Artistique', lines: [t('settings.licenceToConfirm')] },
    { id: 'pixel', name: t('settings.pixelArt'), lines: [t('settings.licenceToConfirm')] },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {credits.map((credit) => (
        <CreditCard
          key={credit.id}
          credit={credit}
          expanded={expandedId === credit.id}
          onToggle={() => setExpandedId(expandedId === credit.id ? null : credit.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  container: { padding: 14, gap: 14 },
  card: { gap: 10 },
  line: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  licence: { fontFamily: fonts.serif, fontSize: 12, lineHeight: 17, color: ui.ink },
});
