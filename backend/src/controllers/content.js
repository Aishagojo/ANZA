export function createContentController(service) {
  return {
    authorizeUpload: context => service.authorizeUpload(context),
    register: context => service.register(context),
    listMine: context => service.listMine(context),
    getOne: context => service.getOne(context),
    remove: context => service.remove(context)
  };
}
