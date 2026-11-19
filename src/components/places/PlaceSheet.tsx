import { ApothecarySheet } from './ApothecarySheet';
import { ChapelSheet } from './ChapelSheet';
import { FindSheet } from './FindSheet';
import { LibrarySheet } from './LibrarySheet';
import { ShopSheet } from './ShopSheet';
import { ThievesGuildSheet } from './ThievesGuildSheet';
import type { PlaceSheetProps } from './usePlaceSheet';

/** A place's sheet, by kind: each a short sheet on the map sheet template. */
export function PlaceSheet(props: PlaceSheetProps) {
  switch (props.place.kind) {
    case 'smithy':
    case 'market':
      return <ShopSheet {...props} />;
    case 'apothecary':
      return <ApothecarySheet {...props} />;
    case 'chapel':
      return <ChapelSheet {...props} />;
    case 'ruins':
    case 'fishingDock':
      return <FindSheet {...props} />;
    case 'library':
      return <LibrarySheet {...props} />;
    case 'thievesGuild':
      return <ThievesGuildSheet {...props} />;
    default:
      return null;
  }
}
