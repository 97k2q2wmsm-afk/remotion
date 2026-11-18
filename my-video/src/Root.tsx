import {Folder} from 'remotion';
import {PompeyaComposition} from './stories/pompeya';

export const RemotionRoot: React.FC = () => {
	return (
		<Folder name="La-Voz-del-Legado">
			<PompeyaComposition />
		</Folder>
	);
};
