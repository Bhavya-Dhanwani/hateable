// Importing modules
import ConversationDao from '../../../shared/dao/conversation.dao.js';
import {
  getCachedConversation,
  cacheConversation,
  CachedConversation
} from '../../../shared/services/redis.service.js';
import { getTitleFromMessage } from '../../../shared/services/ai.service.js';
import logger from '../../../shared/config/logger.config.js';

// function to resolve or create conversation metadata
export async function resolveConversation(
  conversationId: string | undefined,
  projectId: string,
  userId: string,
  conversationDao: ConversationDao
) {
  let cachedConvo = conversationId ? await getCachedConversation(conversationId) : null;
  let conversationTitle = '';
  let resolvedId = conversationId || '';
  let isNew = false;

  if (conversationId && !cachedConvo) {
    const dbConvo = await conversationDao.findConversationById(conversationId);

    if (dbConvo) {
      cachedConvo = {
        conversationId: dbConvo._id.toString(),
        projectId: dbConvo.projectId,
        userId: dbConvo.userId,
        title: dbConvo.title || 'New Chat'
      };

      await cacheConversation(cachedConvo);
    }
  }

  // a conversation id from another project (now that projects are shared) starts a new one
  if (cachedConvo && cachedConvo.projectId !== projectId) {
    cachedConvo = null;
  }

  if (!cachedConvo) {
    const dbConvo = await conversationDao.createConversation({
      projectId,
      userId: userId.toString()
    });

    resolvedId = dbConvo._id.toString();
    isNew = true;
    conversationTitle = dbConvo.title || 'New Conversation';

    cachedConvo = {
      conversationId: resolvedId,
      projectId,
      userId: userId.toString(),
      title: conversationTitle
    };

    await cacheConversation(cachedConvo);
  } else {
    resolvedId = cachedConvo.conversationId;
    conversationTitle = cachedConvo.title;
  }

  return {
    conversationId: resolvedId,
    conversationTitle,
    isNewConversation: isNew,
    cachedConvo
  };
}

// function to generate a title for a new conversation and persist it
export async function generateAndSaveTitle(
  conversationId: string,
  cachedConvo: CachedConversation,
  message: string,
  conversationDao: ConversationDao
): Promise<string> {
  let title = 'New Chat';

  try {
    title = await getTitleFromMessage({ message });
    cachedConvo.title = title;

    await conversationDao.updateConversationById(conversationId, { title });
    await cacheConversation(cachedConvo);

    logger.info(`Generated structured title for new conversation ${conversationId}: "${title}"`);
  } catch (titleError) {
    logger.error(titleError as Error, 'Failed to generate structured title, using default.');
    cachedConvo.title = title;

    await conversationDao.updateConversationById(conversationId, { title });
    await cacheConversation(cachedConvo);
  }

  return title;
}
