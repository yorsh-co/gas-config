/**
 * Host file for the manual fixture, Slides edition.
 *
 * Supplies the one thing that is host-specific, the document's `Ui`. Only
 * this file names `SlidesApp`, so the project asks for that host's scope and no
 * other. `npm run manual:build` picks it with MANUAL_CONFIG_HOST.
 */

/** @OnlyCurrentDoc */

/**
 * The `Ui` of the document this script is bound to.
 * @return {GoogleAppsScript.Base.Ui} The host document's UI.
 */
function getUi_() {
  return SlidesApp.getUi();
}

/**
 * The name of the container this script is bound to.
 * @return {string} The container's name.
 */
function getContainerName_() {
  return SlidesApp.getActivePresentation().getName();
}
