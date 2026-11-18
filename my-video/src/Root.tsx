import {Folder} from 'remotion';
import './channels/basina-gelseydi/brand';
import {PompeyaComposition} from './stories/pompeya';
import {YercekimiComposition} from './stories/yercekimi';
// @bg-imports

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Folder name="Basina-Gelseydi">
				<YercekimiComposition />
				{/* @bg-episodes */}
			</Folder>
			<Folder name="La-Voz-del-Legado">
				<PompeyaComposition />
			</Folder>
		</>
	);
};
