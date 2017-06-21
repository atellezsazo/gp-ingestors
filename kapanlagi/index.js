'use strict';

const libingester = require('libingester');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const url = require('url');
const xml2js = require('xml2js');

const BASE_URI = 'https://www.kapanlagi.com/';
const MAX_ATTEMPTS  = 3;
const MAX_LINKS = 60;
const RSS_URI = 'https://www.kapanlagi.com/feed/';

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'b',
    'iframe',
    'h2',
    'h6',
    'noscript',
    'script',
    'style',
    '.lifestyle-in-content',
    '.link-pagging-warper',
    '.paging-related',
    '.video-wrapper'
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

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        if ($('meta[http-equiv="REFRESH"]').length == 1) throw { name: 'Article have a redirect' };
        if ($('title').text().includes('404')) throw { name: 'Not Found 404' };

        const asset = new libingester.NewsArticle();
        const category = $(".newsdetail-categorylink").first().text();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const date = $('.vcard .newsdetail-schedule-new.updated').text();
        const info_date = $('.newsdetail-schedule-new .value-title').attr('title');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const post_tags = $('.box-content a');
        const page = 'kapanlagi';
        const read_more = `Read more at <a href="${canonical_uri}">${page}</a>`;
        const reporter = $('.vcard .newsdetail-schedule-new a').text();
        const subtitle = $("h2.entertainment-newsdetail-title-new").first().text();
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[name="adx:sections"]').attr('content');
        const title = $("#newsdetail-right-new h1").first().text();
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        // Pull out the main image
        let main_image, image_credit;
        if (uri_main_image) {
            main_image = libingester.util.download_image(uri_main_image, uri);
            main_image.set_title(title);
            image_credit = $('.entertainment-newsdetail-headlineimg .copyright, .pg-img-warper span').text();
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }

        const body_page = $('<div></div>');
        const ingest_body = ($, finish_process) => {
            const body = $('.entertainment-detail-news');
            const next = $('.link-pagging-warper a').attr('href');
            const last_pagination = $('ul.pg-pagging li:last-child a').first();

            // resolve links
            body.find("a").map((i, elem) => {
                if($(elem).attr('href'))
                    $(elem).attr('href',url.resolve(BASE_URI,$(elem).attr('href')));
            });

            // set first paragraph
            const first_p = body.find('p').first();
            const lede = first_p.clone();
            lede.find('img').remove();
            asset.set_lede(lede);
            body.find(first_p).remove();

            const save_video_asset = (video_tag,video_url) => {
                if (video_url) {
                    // video_tag = $('<div></div>');
                    // body.append(video_tag);
                    const video = libingester.util.get_embedded_video_asset(video_tag, video_url);
                    video.set_title(title);
                    video.set_thumbnail(main_image);
                    hatch.save_asset(video);

                }
            }

            // save video asset
            let video_promise;
            let video_tag = $('.videoWrapper').first();
            const video_url = video_tag.attr('data-url');
            video_tag.attr('id', 'video_tag');
            body.append(video_tag.clone());
            video_tag = body.find('#video_tag').first();
            if (video_url) {
                for (const domain of VIDEO_IFRAMES) {
                   if (video_url.includes(domain)) {
                       switch (domain) {
                           case 'a.kapanlagi':
                               {
                                   video_promise = libingester.util.fetch_html(video_url).then($vid => {
                                       const video_url = $vid('title').text();
                                       save_video_asset(video_tag, video_url);
                                   });
                                   break; // exit 'a.kapanlagi'
                               }
                           case 'skrin.id':
                               {
                                   const base_video_uri = 'https://play.skrin.id/media/videoarchive/';
                                   const video_width = '480p.mp4';
                                   let video_uri;
                                   video_promise = libingester.util.fetch_html(video_url).then($vid => {
                                       const source = $vid('script')[2].children[0].data; //script data
                                       let s = source.substring(source.indexOf('JSON.parse(\'') + 12);
                                       s = s.substring(0,s.indexOf("')"));

                                       let json = JSON.parse(s);
                                       const video_uris = json.map(data => url.resolve(base_video_uri, data.url));

                                       for (const uri of video_uris) {
                                           if (uri.includes(video_width)) {
                                               video_uri = uri;
                                               break;
                                           }
                                       }

                                       if (!video_uri) video_uri = video_uris[video_uris.length - 1];
                                       save_video_asset(video_tag, video_url);
                                   }).catch(err => console.log('ERR VID:',err));
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
                editor.parent().remove()
            }
            body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

            // Download images
            body.find("p img").map((i, elem)=> {
                const parent=$(elem).parent();
                if (elem.attribs.src) {
                    if(elem.attribs.alt){
                        var figcaption = $("<figcaption><p>"+elem.attribs.alt.replace('�',' - ')+"</p></figcaption>");
                    }

                    let img = $('<figure></figure>').append($(elem).clone(),figcaption);
                    const image = libingester.util.download_img($(img.children()[0]));
                    if(parent[0].name == 'div'){
                        parent.replaceWith(img);
                    }
                    else{
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
                if (next && last_pagination.length != 0) {
                    libingester.util.fetch_html(url.resolve(uri, next)).then(($next_profile) => {
                        ingest_body($next_profile, finish_process);
                    });
                } else {
                    finish_process();
                }
            }

            if (video_promise) {
                video_promise.then(end_function);
            } else {
                end_function();
            }
        };

        return new Promise((resolve, reject) => {
            ingest_body($, () => {

                console.log('processing', title);
                asset.set_authors([reporter]);
                asset.set_canonical_uri(canonical_uri);
                asset.set_canonical_uri(uri);
                asset.set_custom_scss(CUSTOM_CSS);
                asset.set_date_published(Date.now(modified_date));
                asset.set_last_modified_date(modified_date);
                asset.set_read_more_link(read_more);
                asset.set_section(section);
                asset.set_source(page);
                asset.set_synopsis(synopsis);
                asset.set_title(title);
                asset.set_main_image(main_image,image_credit);
                asset.set_body(body_page);

                asset.render();
                hatch.save_asset(asset);
                resolve();
            });
        })
    }).catch((err) => {
        console.log("Ingest error: ", err);
    });
}

function main() {
    const hatch = new libingester.Hatch('kapanlagi', 'id');

    let attempt = 1;

    const __request = (f) => {
        rp({ uri: RSS_URI, gzip: true }).then(res => {
            var parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
            parser.parseString(res, (err, result) => {
                const rss = rss2json.parser(result);
                let links = [],
                    n = 0;
                const items=rss.items.slice(MAX_LINKS);
                for(const item of items){
                    if (!item.link.includes("musik.kapanlagi.com")) { //drop musik subdomain
                        links.push(item.link);
                    }
                }
                f(links); //callback
            });
        }).catch(err => {
            console.log('Error load Rss:', err);
            if (attempt++ < MAX_ATTEMPTS) {
                __request(f);
            }
        });
    }     
    __request((links) => {
        Promise.all(links.map((link) => ingest_article(hatch, link))).then(() => {
            return hatch.finish();
        });
    })
}

main();
