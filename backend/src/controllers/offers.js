export function createOfferController(service) {
  return {
    create: context => service.create(context),
    get: context => service.get(context.id, context.pubkey),
    publish: context => service.publish(context)
  };
}
