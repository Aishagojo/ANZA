export function createOfferController(service) {
  return {
    create: context => service.create(context),
    get: context => service.get(context.id, context.pubkey),
    publish: context => service.publish(context),
    createPayment: context => service.createPayment(context),
    getStatus: context => service.getStatus(context),
    lightningWebhook: context => service.lightningWebhook(context)
  };
}
