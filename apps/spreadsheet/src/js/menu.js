/*
 * Ribbon menus of the spreadsheet's own functions (Data → Group, Data → Clean up).
 *
 *   SSMenu.submenu(univerAPI, { id, title, icon, order, position, items: [[id, title, action], ...] })
 *
 * The facade's createSubmenu puts the items into group nodes, which the ribbon's dropdown does not show; the schema is therefore
 * merged in the shape of Univer's own menus (items directly below the submenu, ordered). A dropdown runs the command with the
 * item's id, so each action is registered as a command under that id. Titles are keys of Univer's locales.
 */
(function () {
  'use strict';

  function submenu(univerAPI, { id, title, icon, order = 10, position = 'ribbon.data.organization', items }) {
    const menu = univerAPI.createSubmenu({ id, title, tooltip: title, icon });
    const schema = menu.__getSchema()[id];
    for (const key of Object.keys(schema)) if (key !== 'menuItemFactory' && key !== 'order') delete schema[key];
    schema.order = order;
    items.forEach(([itemId, itemTitle, action], index) => {
      const item = univerAPI.createMenu({ id: itemId, title: itemTitle, tooltip: itemTitle, action: itemId, order: index });
      if (!item._commandService.hasCommand(itemId)) item._commandService.registerCommand({ id: itemId, type: 0, handler: () => { action(); return true; } });
      Object.assign(schema, item.__getSchema());
    });
    menu._menuManagerService.mergeMenu({ [position]: { [id]: schema } });
  }

  window.SSMenu = { submenu };
})();
