import {AssessmentTypes, CurriculumModule, Tantervihalo, Subject, TantervihaloLoader} from "./api.js";

async function fetchResponse(url) {
	if (url.match(/^https?:\/\//)) {
		url = "https://tantervihalo-visualizer-proxy.herokuapp.com/" + encodeURI(url);
	}
	return fetch(url, {});
}

async function fetchText(url) {
	const res = await fetchResponse(url);
	return res.text();
}

async function fetchBytes(url) {
	const res = await fetchResponse(url);
	const blob = await res.blob();
	return blob.arrayBuffer();
}

async function loadXlsx(ul, linkUrl) {
		const bytes = await fetchBytes(linkUrl);
		const loader = new TantervihaloLoader(bytes);
		window.wb = loader.workbook;
		loader.addEventListener('unexpectedRow', ({detail: {excelRow: row}}) => {
			console.warn(`Skipping workbook ${wbName} worksheet ${wsName} row ${rowIndex}`);
			// todo
		});
		loader.addEventListener('skippedSumRow', ({detail: {excelRow: row}}) => {
			console.debug(`Skipping sum: workbook ${wbName} worksheet ${wsName} row ${rowIndex}`);
			// todo
		});
		loader.addEventListener('tantervihaloFound', ({detail: {tantervihalo, eventTarget: tantervihaloLoadingEvents}}) => {
			const wsLi = ul.appendChild(document.createElement('li'));
			wsLi.representedTantervihalo = tantervihalo;
			wsLi.innerText = tantervihalo.title;
			const wsUl = wsLi.appendChild(document.createElement('ul'));
			tantervihaloLoadingEvents.addEventListener('moduleFound', ({detail: {module, eventTarget: moduleLoadingEvents}}) => {
				const moduleLi = wsUl.appendChild(document.createElement('li'));
				const moduleSpan = moduleLi.appendChild(document.createElement('span'));
				const moduleDropdown = moduleLi.appendChild(document.createElement('select'));
				const modulePre = moduleLi.appendChild(document.createElement('pre'));
				moduleLi.representedModule = module;

				function updateModulePre() {
					modulePre.innerText = module.ignored ? "" : JSON.stringify(module, null, 2);
				}
				moduleLoadingEvents.addEventListener('titleFound', ({detail: {title}}) => {
					moduleSpan.innerText = title;
				});
				moduleLoadingEvents.addEventListener('subjectFound', () => {
					updateModulePre();
				});

				moduleDropdown.innerHTML = `
<option disabled selected></option>
<option value="compulsory">compulsory</option>
<option value="elective">elective</option>
<option value="ignored">ignored</option>`;
				moduleDropdown.addEventListener('input', ({target: {value}}) => {
					switch (value) {
						case 'compulsory':
							module.ignored = false;
							module.elective = false;
							break;

						case 'elective':
							module.ignored = false;
							module.elective = true;
							break;

						case 'ignored':
							module.ignored = true;
							console.log(module);
							break;
					}

					updateModulePre();
				});
			});

			const displayButton = wsLi.insertBefore(document.createElement('button'), wsUl);
			displayButton.innerText = 'Select';
			let viz = new Viz();
			displayButton.addEventListener('click', async () => {
				document.getElementById('subjectListDetails').open = true;
				let graph = `digraph ${JSON.stringify(tantervihalo.title)} {`;
				graph += `label=${JSON.stringify(tantervihalo.title)};`;
				for (const module of tantervihalo.modules) {
					graph += `subgraph ${JSON.stringify("cluster_" + module.title)} {`;
					graph += `label=${JSON.stringify(module.title)};`;
					for (const subject of module) {
						graph += `${JSON.stringify(subject.code)};`;
						if (subject.elective) {
							graph += `${JSON.stringify(subject.code)}[style=dashed];`;
						}
					}
					graph += `}`;
				}
				graph += `rankdir=LR;`;
				for (const subject of tantervihalo) {
					for (const req of subject.requirements) {
						graph += `${JSON.stringify(req.code)}->${JSON.stringify(subject.code)};`;
					}
				}
				graph += `}`;
				try {
					document.getElementById('subjectListDiv')
						.dataset['graph'] = graph;
					document.getElementById('subjectListDiv')
						.representedTantervihalo = tantervihalo;
					const element = await viz.renderSVGElement(graph);
					document.getElementById('subjectListDiv')
						.replaceChildren(element);
					document.getElementById('fileContentDetails')
						.open = false;
				} catch (e) {
					viz = new Viz();
					document.getElementById('subjectListDiv').innerText = e;
				}
				document.getElementById('subjectListDetails').scrollIntoView();
			});
		});
		await loader.loadedPromise;
}

async function loadFileList(outerUl) {
	let innerUl = outerUl.appendChild(document.createElement('li'))
		.appendChild(document.createElement('ul'));

	const html = await fetchText("https://www.inf.elte.hu/tantervihalok");
	// const regexp = /<a class="jumptarget" id="([^"]*)" name="([^"]*)"><\/a>|<a href="([^"]*\.(pdf|xlsx?))" target="_blank">([^<]*)<\/a>/g;
	const regexp = /<h2(?: id="([^"]*)")>([^<]*)<\/h2>|<a href="([^"]*\.(pdf|xlsx?))" target="_blank">([^<]*)<\/a>/g;
	for (const match of html.matchAll(regexp)) {
		const [s, jumptargetId, jumptargetName, linkUrl, linkExt, linkName] = match;
		if (jumptargetName) {
			const li = outerUl.appendChild(document.createElement('li'));
			li.innerHTML = jumptargetName;
			innerUl = li.appendChild(document.createElement('ul'));
		} else {
			const a = innerUl
				.appendChild(document.createElement('li'))
				.appendChild(document.createElement('a'));
			a.innerHTML = linkName;
			a.href = linkUrl;
			a.dataset['extension'] = linkExt;

			switch (linkExt) {
				case 'xlsx': {
					const button = a.parentElement.appendChild(document.createElement('button'));
					button.innerText = 'select';
					button.addEventListener('click', async (evt) => {
						const ul = document.getElementById('fileContentUl');
						button.disabled = true;
						ul.innerText = "";
						document.getElementById('fileContentDetails').open = true;
						try {
							await loadXlsx(ul, linkUrl);
							document.getElementById('fileContentDiv').innerHTML = "";
							document.getElementById('fileListDetails').open = false;
							document.getElementById('fileContentDetails').scrollIntoView();
						} catch (e) {
							console.error(e);
							ul.innerHTML = e.toString();
							button.style.backgroundColor = 'red';
						} finally {
							button.disabled = false;
						}
					});
				}
					break;
			}
		}
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const loadButton = document.getElementById('loadButton');
	loadButton.addEventListener('click', async () => {
		loadButton.disabled = true;
		const ul = document.getElementById('ul');
		ul.innerHTML = "";
		try {
			await loadFileList(ul);
		} catch (e) {
			console.error(e);
			ul.innerHTML = e.toString();
			loadButton.style.backgroundColor = 'red';
		} finally {
			loadButton.disabled = false;
		}
	});
});

// debugging
window.loadFileList = loadFileList;
window.loadXlsx = loadXlsx;
