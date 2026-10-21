function mergeRequests(existingRequests = [], incomingRequests = []) {
    const map = new Map();

    const addRequest = (request) => {
        if (!request || !request.id) return;
        const existing = map.get(request.id);
        if (!existing) {
            map.set(request.id, { ...request, events: Array.isArray(request.events) ? [...request.events] : [] });
            return;
        }

        const merged = {
            ...existing,
            ...request,
            reporter: request.reporter || existing.reporter,
            photos: request.photos || existing.photos,
            parts: Array.isArray(request.parts) ? request.parts : (existing.parts || []),
            diagnostic: request.diagnostic || existing.diagnostic,
            events: [...(existing.events || []), ...(request.events || [])]
        };

        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const incomingTime = request.updatedAt ? new Date(request.updatedAt).getTime() : 0;
        if (incomingTime > existingTime) {
            merged.status = request.status || existing.status;
            merged.updatedAt = request.updatedAt || existing.updatedAt;
            merged.assignedTo = request.assignedTo ?? existing.assignedTo;
        }

        const mergedEvents = [...(existing.events || []), ...(request.events || [])];
        const uniqueEvents = mergedEvents.filter((event, index, array) => {
            const key = `${event.title}|${event.author}|${event.at}|${event.text || ''}`;
            return array.findIndex(item => `${item.title}|${item.author}|${item.at}|${item.text || ''}` === key) === index;
        });
        merged.events = uniqueEvents;

        map.set(request.id, merged);
    };

    existingRequests.forEach(addRequest);
    incomingRequests.forEach(addRequest);

    return Array.from(map.values());
}

if (typeof module !== 'undefined') {
    module.exports = { mergeRequests };
}
