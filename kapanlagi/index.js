'use strict';

const libingester = require('libingester');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const url = require('url');
const xml2js = require('xml2js');

const BASE_URI = 'https://www.kapanlagi.com/';
const RSS_URI = 'https://www.kapanlagi.com/feed/';
const PAGE_TRENDS = 'https://www.kapanlagi.com/trending/';
const PAGE_VIDEOS = 'https://video.kapanlagi.com/';

// Kapanlagi doesn't seem to report its content type properly, so override it
const HTML_CHARSET = 'iso-8859-1';

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'h2',
    'h6',
    'noscript',
    'script',
    'style',
    '.box-detail',
    '.lifestyle-in-content',
    '.link-pagging-warper',
    '.paging-related',
    '.video-wrapper',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'sizes',
    'srcset',
    'style',
    'width'
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'i',
    'img',
    'span',
    'table',
];

const CUSTOM_CSS = `
$primary-light-color: #EE3A81;
$primary-medium-color: #336699;
$primary-dark-color: #100F0F;
$accent-light-color: #F2B328;
$accent-dark-color: #F68B29;
$background-light-color: #EDEDED;
$background-dark-color: #E3E3E3;
$title-font: 'Lato';
$body-font: 'Merriweather';
$display-font: 'Oswald';
$context-font: 'Oswald';
$support-font: 'Lato';
@import '_default';
`;

// embed video
const VIDEO_IFRAMES = [
    'a.kapanlagi',
    'skrin.id',
    'streamable',
    'youtube'
];

function ingest_article(hatch, entry) {
    return libingester.util.fetch_html(entry.link, HTML_CHARSET).then($ => {
        if ($('meta[http-equiv="REFRESH"]').length == 1) throw { name: 'Article have a redirect', code: -1 };
        if ($('title').text().includes('404')) throw { name: 'Not Found 404', code: -1};

        const asset = new libingester.NewsArticle();
        const category = $(".newsdetail-categorylink").first().text();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const date = $('.vcard .newsdetail-schedule-new.updated').text();
        const info_date = $('.date-post .value-title').attr('title');
        const modified_date = entry.created ? new Date(entry.created) : new Date(Date.parse(info_date));
        const post_tags = $('.box-content a');
        const page = 'kapanlagi';
        const read_more = `Baca lebih lanjut di <a href="${canonical_uri}">${page}</a>`;
        const subtitle = $("h2.entertainment-newsdetail-title-new").first().text();
        const synopsis = $('meta[name="description"]').attr('content');
        const section = (entry.category) ? entry.category : $('meta[name="adx:sections"]').attr('content');
        const h1 = $(".content-detail h1, .entertainment-detail-news h1").first();
        const title = h1.text();
        const uri_main_image = $('meta[property="og:image"]').attr('content');
        const is_gallery = url.parse(entry.link).path.includes('/foto/');
        let reporter = $('.reporter span').text(), lede;

        // delete strange char's
        const regex = new RegExp('&#xEF;&#xBF;&#xBD;', 'g');
        const clean_text = (text) => text.replace(regex, ' ').trim();
        const clean_paragraph = ($p) => $(`<p>${clean_text($p.html())}</p>`);

        // Pull out the main image
        let main_image, image_credit, thumbnail;
        if (uri_main_image && !is_gallery) {
            main_image = libingester.util.download_image(uri_main_image);
            main_image.set_title(title);
            image_credit = $('.content-detail .detail-head-img span').html() || '';
            if (image_credit) {
                image_credit = $(`<figcaption><p>${clean_text(image_credit)}</p></figcaption>`);
            }
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }

        const body_page = $('<div></div>');
        const ingest_body = ($, reject, finish_process) => {
            const body = $('.body-paragraph, .entertainment-detail-news');
            const next = $('.link-pagging-warper a, .pull-right a').attr('href');
            const last_pagination = $('ul.pg-pagging li:last-child a').first();

            // resolve links
            body.find("a").map((i, elem) => {
                if($(elem).attr('href'))
                    $(elem).attr('href',url.resolve(BASE_URI,$(elem).attr('href')));
            });

            const save_video_asset = (video_tag,video_url) => {
                if (video_url) {
                    const $main_tag = $('<figure><div></div></figure>');
                    const $tag = $main_tag.find('div');
                    video_tag.replaceWith($main_tag);
                    const video = libingester.util.get_embedded_video_asset($tag, video_url);
                    video.set_title(title);
                    video.set_thumbnail(main_image);
                    hatch.save_asset(video);
                }
            };

            // save video asset
            let video_promise;
            let video_tag = $('.videoWrapper').first();
            const video_url = video_tag.attr('data-url');
            video_tag.attr('id', 'video_tag');
            body.prepend(video_tag.clone());
            video_tag = body.find('#video_tag').first();
            if (video_url) {
                for (const domain of VIDEO_IFRAMES) {
                   if (video_url.includes(domain)) {
                       switch (domain) {
                           case 'a.kapanlagi':
                               {
                                   video_promise = libingester.util.fetch_html(video_url, HTML_CHARSET).then($vid => {
                                       const video_url = $vid('title').text();
                                       save_video_asset(video_tag, video_url);
                                   });
                                   break; // exit 'a.kapanlagi'
                               }
                           case 'skrin.id':
                               {
                                   const base_video_uri = 'https://play.skrin.id/media/videoarchive';
                                   const video_width = '480p.mp4';
                                   let video_uri;
                                   video_promise = libingester.util.fetch_html(video_url, HTML_CHARSET).then($vid => {
                                       // In the page only there are embedded videos, that is why I search with the filter "script"
                                       //  In the 3rd label script that find links of the videos,
                                       const source = $vid('script')[2].children[0].data;
                                       // Of the links, it looks for the chain that contains the JSON to clean and to construct a new JSON
                                       let s = source.substring(source.indexOf('JSON.parse(\'') + 12);
                                       s = s.substring(0,s.indexOf("')"));

                                       //JSON containing url videos
                                       let json = JSON.parse(s);
                                       const video_uris = json.map(data => base_video_uri + data.url);

                                       //We are looking for url that contain '480.mp4'
                                       for (const uri of video_uris) {
                                           if (uri.includes(video_width)) {
                                               video_uri = uri;
                                               break;
                                           }
                                       }
                                       // If the video is not found, the last link is taken
                                       if (!video_uri) video_uri = video_uris[video_uris.length - 1];
                                       save_video_asset(video_tag, video_uri);
                                   });
                                   break; // exit 'skrin.id'
                               }
                           default:
                               {
                                   save_video_asset(video_tag, video_url);
                               }
                       }
                   }
                }
            }

            // remove elements and comments
            const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
            body.contents().filter((index, node) => node.type === 'comment').remove();
            body.find(REMOVE_ELEMENTS.join(',')).remove();
            body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
            let editor = body.find('span').last();
            if(editor.text().includes('Editor:')){
                if (!reporter) {
                    reporter = editor.parent().text().replace('Editor:','').trim();
                }
                editor.parent().remove();
            }
            h1.remove();

            // reporter for gallery
            if (!reporter) {
                reporter = $('span.reporter').text() || '';
                reporter = reporter.replace('Penulis:', '').trim();
            }

            // if is gallery
            if (is_gallery) {
                $('.dt-photov2').map((i,elem) => {
                    const $img = $(elem).find('img').first();
                    const $caption = $(elem).find('.body-photo p').first();
                    const $copyright = $(elem).find('.copyright-dp span').first();
                    const $figcaption = $(`<figcaption></figcaption>`);
                    if ($caption[0]) $figcaption.append($caption.clone());
                    if ($copyright[0]) $figcaption.find('p').append(`<br>`, $copyright.clone());
                    const $figure = $(`<figure><img src="${$img.attr('src')}" alt="${$img.attr('alt')}"/></figure>`);
                    $figure.append($figcaption);
                    body_page.append($figure);
                    const image = libingester.util.download_img($figure.find('img'));
                    image.set_title(title);
                    hatch.save_asset(image);
                    if (!thumbnail) asset.set_thumbnail(thumbnail = image);
                });
                if (!lede) {
                    lede = $('.deskrip-foto p').first().clone();
                }
            }

            // Download images
            body.find("p img").map((i, elem)=> {
                const parent=$(elem).parent();
                let figcaption = '';
                if (elem.attribs.src) {
                    if(elem.attribs.alt){
                        figcaption = $("<figcaption><p>"+elem.attribs.alt.replace('�',' - ')+"</p></figcaption>");
                    }

                    let img = $('<figure></figure>').append($(elem).clone(),figcaption);
                    const image = libingester.util.download_img($(img.children()[0]));
                    if(parent[0].name == 'div'){
                        parent.replaceWith(img);
                    } else {
                        $(elem).replaceWith(img);
                    }
                    image.set_title(title);
                    hatch.save_asset(image);
                    elem.attribs["data-libingester-asset-id"] = image.asset_id;
                } else {
                    $(elem).remove();
                }
            });

            const end_function = () => {
                body_page.append(body.children());
                if ((next && last_pagination.length !== 0) || (is_gallery && next)) {
                    libingester.util.fetch_html(url.resolve(entry.link, next), HTML_CHARSET).then(($next_profile) => {
                        ingest_body($next_profile, reject, finish_process);
                    }).catch(err => reject(err));
                } else {
                    finish_process();
                }
            };

            if (video_promise) {
                video_promise.then(end_function).catch(err => reject(err));
            } else {
                end_function();
            }
        };

        return new Promise((resolve, reject) => {
            ingest_body($, reject, () => {
                // fix paragraphs (convert a paragraph with labels "br" in several paragraphs)
                let p = $('<p></p>');
                body_page.contents().filter((i,elem) => elem.name == 'p').map((i,elem) => {
                    const insert_last_p = () => {
                        if (p.text().trim() != '') {
                            p.insertBefore(elem);
                            p = $('<p></p>');
                        }
                    }
                    $(elem).contents().map((i,content) => {
                        if (content.name == 'br') {
                            insert_last_p();
                        } else {
                            p.append($(content).clone());
                        }
                    });
                    insert_last_p();
                    $(elem).remove();
                });

                // fix figure into p
                body_page.find('p>figure').map((i,elem) => $(elem).insertBefore($(elem).parent()));

                // remove empty paragraphs
                body_page.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

                // delete strange char's
                body_page.find('p').map((i,p) => $(p).replaceWith( clean_paragraph($(p)) ));

                // set first paragraph
                if (!lede) {
                    const first_p = body_page.find('p').first();
                    const lede = first_p.clone();
                    lede.find('img').remove();
                    asset.set_lede(lede);
                    body_page.find(first_p).remove();
                } else {
                    asset.set_lede(lede);
                }

                if (main_image) asset.set_main_image(main_image,image_credit);

                // article settings
                asset.set_authors([reporter]);
                asset.set_canonical_uri(canonical_uri);
                asset.set_custom_scss(CUSTOM_CSS);
                asset.set_date_published(Date.now(modified_date));
                asset.set_last_modified_date(modified_date);
                asset.set_read_more_link(read_more);
                asset.set_section(section);
                asset.set_source(page);
                asset.set_synopsis(synopsis);
                asset.set_title(title);
                asset.set_body(body_page);
                asset.render();
                hatch.save_asset(asset);
                resolve();
                console.log('Processing', canonical_uri);
            });
        });
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT' || err.code == 'ENOTFOUND')
            return ingest_article(hatch, entry);
        if (err.code != -1) throw err;
    });
}

/* delete duplicated elements in array (find by attr 'link' of object) */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){
    for (let x=b+1; x<c.length; x++) {
        if (c[x].link == a.link) return false;
    }
    return true;
});

/* add or sustract days to a date */
const add_date = (date, numDays = 0) => {
    return date.setDate(date.getDate() + numDays);
}

/* convert response html */
const parse_html = (res) => {
    return new Promise((resolve, reject) => {
        const parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
        parser.parseString(res, (err, result) => (err) ? reject(err) : resolve(result));
    });
}

/* fetch html */
const load_html = (uri) => {
    return rp({ uri: RSS_URI, gzip: true }).then(res => {
        const parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
        return parse_html(res);
    }).catch(err => {
        const error = err.error || {};
        if (error.code == 'ENOTFOUND')
            return load_html(uri);
        return Promise.reject(err);
    });
}

/* load rss entries filtered by date */
const load_rss = (uri, oldDays = 1) => {
    const today = add_date(new Date(), oldDays*-1);
    let entries = [];
    return load_html(uri).then(result => {
        rss2json.parser(result).items.map(item => {
            const date = new Date(item.created);
            if (date >= today) entries.push(item);
        });
        return entries;
    });
};

/* get video or trends entries (filtered by date) */
const load_page_entries = (uri, oldDays = 1) => {
    return libingester.util.fetch_html(uri, HTML_CHARSET).then($ => {
        const today = add_date(new Date(), oldDays*-1);
        let entries = [];
        $('#mostfb .list-trending, #v6-tags-populer li').map((i,elem) => {
            let datetime_id = $(elem).find('.sche-news, .date');
            datetime_id.find('a').remove();
            datetime_id = datetime_id.text().split(',')[1].trim();
            const date = new Date(Date.parse(parse_month(datetime_id)));
            const link = url.resolve(BASE_URI, $(elem).find('a').first().attr('href'));
            const category = (url.parse(uri).hostname == 'video.kapanlagi.com') ? 'video' : 'trending';
            if (date >= today) entries.push({link: link, created: date.getTime(), category: category});
        });
        return entries;
    }).catch(err => {
        if (err.code == 'ENOTFOUND')
            return load_page_entries(uri, oldDays);
    });
}

/* parse month (in "id") to US format */
const parse_month = (date_string) => {
    date_string = date_string.toLowerCase();
    return date_string.replace(
        /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/,
        (x) => {
            switch (x) {
                case 'mei': return 'may';
                case 'agustus': return 'aug';
                case 'oktober': return 'oct';
                case 'desember': return 'dec';
                default: return x.substring(0,3);
            }
        });
}

/* return all entries */
const fetch_all_entries = (oldDays) => {
    let all_entries = [];
    const trends = load_page_entries(PAGE_TRENDS, oldDays).then(entries => all_entries = all_entries.concat(entries));
    const videos = load_page_entries(PAGE_VIDEOS, oldDays).then(entries => all_entries = all_entries.concat(entries));
    const feeds  = load_rss(RSS_URI, oldDays).then(entries => all_entries = all_entries.concat(entries));
    return Promise.all([trends, videos, feeds]).then(() => all_entries.unique());
}

function main() {
    const hatch = new libingester.Hatch('kapanlagi', 'id');
    const oldDays = parseInt(process.argv[2]) || 1; // in test is 5 (1 is 24h back)

    fetch_all_entries(oldDays).then(entries => {
        return Promise.all(entries.map(entry => ingest_article(hatch, entry)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
