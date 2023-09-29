import { type IExecuteFunctions, type INodeExecutionData, NodeConnectionType } from 'n8n-workflow';

import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import type { Tool } from 'langchain/tools';
import type { BaseOutputParser } from 'langchain/schema/output_parser';
import { PromptTemplate } from 'langchain/prompts';
import { CombiningOutputParser } from 'langchain/output_parsers';
import type { BaseChatMemory } from 'langchain/memory';
import type { OpenAIChat } from 'langchain/dist/llms/openai-chat';

export async function openAiFunctionsAgentExecute(
	this: IExecuteFunctions,
): Promise<INodeExecutionData[][]> {
	this.logger.verbose('Executing OpenAi Functions Agent');
	const runMode = this.getNodeParameter('mode', 0) as string;

	const model = (await this.getInputConnectionData(
		NodeConnectionType.AiLanguageModel,
		0,
	)) as OpenAIChat;
	const memory = (await this.getInputConnectionData(NodeConnectionType.AiMemory, 0)) as
		| BaseChatMemory
		| undefined;
	const tools = (await this.getInputConnectionData(NodeConnectionType.AiTool, 0)) as Tool[];
	const outputParsers = (await this.getInputConnectionData(
		NodeConnectionType.AiOutputParser,
		0,
	)) as BaseOutputParser[];

	const agentExecutor = await initializeAgentExecutorWithOptions(tools, model, {
		agentType: 'openai-functions',
	});

	if (memory) {
		agentExecutor.memory = memory;
	}

	const returnData: INodeExecutionData[] = [];

	let outputParser: BaseOutputParser | undefined;
	let prompt: PromptTemplate | undefined;
	if (outputParsers.length) {
		outputParser =
			outputParsers.length === 1 ? outputParsers[0] : new CombiningOutputParser(...outputParsers);

		const formatInstructions = outputParser.getFormatInstructions();

		prompt = new PromptTemplate({
			template: '{input}\n{formatInstructions}',
			inputVariables: ['input'],
			partialVariables: { formatInstructions },
		});
	}

	const items = this.getInputData();

	let itemCount = items.length;
	if (runMode === 'runOnceForAllItems') {
		itemCount = 1;
	}

	// Run for each item
	for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
		let input = this.getNodeParameter('text', itemIndex) as string;

		if (prompt) {
			input = (await prompt.invoke({ input })).value;
		}

		let response = await agentExecutor.call({ input, outputParsers });

		if (outputParser) {
			response = { output: await outputParser.parse(response.output as string) };
		}

		returnData.push({ json: response });
	}

	return this.prepareOutputData(returnData);
}
