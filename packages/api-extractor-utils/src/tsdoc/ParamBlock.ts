import type { ApiItem, ApiModel } from '@ckohen/api-extractor-model';
import type { DocParamBlock } from '@microsoft/tsdoc';
import { block, type DocBlockJSON } from './CommentBlock.js';

interface DocParamBlockJSON extends DocBlockJSON {
	name: string;
}

export function paramBlock(
	paramBlock: DocParamBlock,
	model: ApiModel,
	version: string,
	parentItem?: ApiItem,
): DocParamBlockJSON {
	return {
		...block(paramBlock, model, version, parentItem),
		name: paramBlock.parameterName,
	};
}
