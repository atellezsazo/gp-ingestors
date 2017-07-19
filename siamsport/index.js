'use strict';

const libingester = require('libingester');
const moment = require('moment');
const url = require('url');

const base_uri = 'http://www.siamsport.co.th/';
const uri_article = 'http://www.siamsport.co.th/More_News.asp';
const uri_gallery = 'http://www.siamsport.co.th/SiamsportPhoto/index.php';
const uri_video = 'http://sstv.siamsport.co.th/top_hits.php';

// clean images
const REMOVE_ATTR = [
    'class',
    'style'
];

// Remove elements (meta.body)
const REMOVE_ELEMENTS = [
    'br',
    'div',
    'iframe',
    'script',
    'hr',
    'style',
    '.othdetailnews',
    '.referbg',
    '.relate-news-horizon',
    '.sectionright',
    '.social',
    '.titlenews',
    '.toptitle2',
    '#ssinread',
    '#comment',
    '#ssinread'
];

// copyright warning
const REMOVE_COPYRIGHT = [
    'Getty Images',
    'mirror.com',
    'Siamsport',
    '"บอ.บู๋"'
];

// embed video
const VIDEO_IFRAMES = [
    'sstv.siamsport.co.th'
];

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('meta[property="og:url"]').attr('content');
    const d = $(`.titlenews .black13, .newsde-title .black11,
                 .toptitle2 .black13t, .date-time, .font-gray`).text();
    let date='';
    date = new Date(Date.parse(moment(d,'DD-MM-YYYY hh:mm').format()));
    if(date=='Invalid Date'){
        date = new Date();
    }

    const desc = $(`meta[property="og:description"], meta[name="description"], meta[name="Description"]`).attr('content') || '';
    const title = clean_title($('.font-pink18').first().text()) || $('meta[property="og:title"]').attr('content') || $('title').text();
    const section = canonical_uri.replace('http://www.siamsport.co.th/','');
    return {
        author: 'siamsport.co.th', // no authors
        body: $('.newsdetail, .txtdetails').first(), // all
        canonical_uri: canonical_uri,
        date_published: Date.now(date),
        modified_date: date,
        // custom_scss: CUSTOM_SCSS,
        page: 'Siamsport',
        read_more: `Bài gốc ở <a href="${canonical_uri}">siamsport</a>`,
        section: section.substring(0,section.indexOf('/')), // no section
        synopsis: desc.replace(/[\t\n]/g, ''),
        source: 'siamsport',
        title: title.replace(/[\t\n]/g, ''),
    }
}

/** set articles metadata **/
function _set_ingest_settings(asset, meta) {
    if (meta.author) asset.set_authors(meta.author);
    if (meta.body) asset.set_body(meta.body);
    if (meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if (meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if (meta.date_published) asset.set_date_published(meta.date_published);
    if (meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if (meta.lede) asset.set_lede(meta.lede);
    if (meta.read_more) asset.set_read_more_link(meta.read_more);
    if (meta.section) asset.set_section(meta.section);
    if (meta.source) asset.set_source(meta.source);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
}

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        const uri_main_image = meta.body.prev().find('img').attr('src') || $('meta[property="og:image"]').attr('content');
        console.log('processing: '+ uri);

        if (!meta.body[0]) throw {code: -1, message: 'Empty body'};

        // delete br, and add wrapp 'p' to lost text
        const convert_p = (master_tag, take_out=False) => {
            let lost_p = $('<p></p>');
            let first_br = false;
            let element;
            $(master_tag).contents().filter((i,elem) => {
                element = elem;
                if (elem.name == 'br') {
                    if (lost_p.text().trim() != '' && !first_br) {
                        // append the new paragraph to the body
                        if (take_out) {
                            lost_p.clone().insertBefore(master_tag);
                        } else {
                            $(elem).replaceWith(lost_p.clone());
                        }
                        lost_p = $('<p></p>');
                        first_br = true;
                    } else {
                        $(elem).remove(); // if the 'br' is not replaced, then we eliminate it
                    }
                } else if ($(elem).text().trim() != '') {
                    lost_p.append(elem); // if there is text, we add it
                    first_br = false;
                }
            });
            // append lasts p
            if (lost_p.text().trim() != '') {
                if (take_out) {
                    lost_p.clone().insertBefore(master_tag);
                } else {
                    $(element).replaceWith(lost_p.clone());
                }
            }
        }

        // fixed paragraphs
        meta.body.contents().filter((i,elem) => elem.name == 'p').map((i,p) => {
            convert_p(p, true);
        });

        // delete copyright
        const copyright = meta.body.find('p>span>strong').last();
        if (copyright.text().trim() == 'Siamsport') {
            const last_p = copyright.parent().parent();
            last_p.next().remove();
            last_p.remove();
        }


        // console.log('--------------------------------------------------------');
        // console.log(uri);
        // console.log('--------------------------------------------------------');
        // console.log('author: '+ meta.author);
        // //console.log('body: '+ body);
        // console.log('canonical_uri: '+ meta.canonical_uri);
        // console.log('modified_date: '+ meta.modified_date);
        // console.log('page: '+ meta.page);
        // console.log('read_more: '+ meta.read_more);
        // console.log('synopsis: '+ meta.synopsis);
        // console.log('section: '+ meta.section);
        // console.log('title: '+ meta.title);
        // console.log('uri_main_image: '+ uri_main_image);
        // console.log('--------------------------------------------------------');

        // main image
        const main_image = libingester.util.download_image(uri_main_image);
        main_image.set_title(meta.title);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, '');
        hatch.save_asset(main_image);


        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        meta.body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
        meta.body.contents().filter((i,elem) => elem.type == 'comment').remove();

        // set first paragraph
        const first_p = meta.body.find('strong, div, p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        meta['lede'] = lede;
        first_p.remove();

        // take out p into div
        const div_body = meta.body.find('div').first();
        div_body.find('p').map((i,elem) => {
            $(elem).insertBefore(div_body);
        });

        // clean attribs (meta.body)
        meta.body.find('p, div, span').removeAttr('style');

        // convert 'p strong' to 'h2'
        meta.body.find('p strong').map((i,elem) => {
            const text = $(elem).text().trim();
            let parent = $(elem).parent()[0];
            while (parent) {
                if (parent.name == 'p') {
                    const p_text = $(parent).text().trim();
                    if (text == p_text) {
                        $(parent).replaceWith($(`<h2>${text}</h2>`));
                    }
                    break;
                } else {
                    parent = $(parent).parent()[0];
                }
            }
        });

        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log('Ingest article error: ', err);
        if (err.code==-1) { return ingest_article(hatch, uri); }
    });
}

function clean_title(title) {
    return title.replace(':: SIAMSPORT PHOTO ::','').trim();
}

function ingest_gallery(hatch, uri, meta) {
    return libingester.util.fetch_html(uri, `ascii`).then(($) => {
        const asset = new libingester.NewsArticle();
        const title = clean_title($('.font-pink18').first().text());
        if (!meta) {
            meta = _get_ingest_settings($, {});
            meta.body = $('<div><div>');
            meta.lede = $('.font-pink18').first().text();
            meta.author = 'Siamsport'; // the galleries have no author
        }

        //Article Settings
       asset.set_canonical_uri(uri);
       asset.set_section('Gallery');
       asset.set_title(title);

        let image_uri = $('a[rel="exgroup"]').get().map((a) => {
            return url.resolve(uri_gallery, a.attribs.href);
        });

        image_uri.shift(); //remove repeat link

        if (image_uri) {

            let images = [];
            for (const src of image_uri) {
                const image = libingester.util.download_image(src);

                image.set_title(title);
                hatch.save_asset(image);
                if (!meta.main_image) {
                    meta.main_image = image;
                } else {
                    meta.body.append($(`<figure><img data-libingester-asset-id="${image.asset_id}"/><figure>`));
                }
            }
        }

        meta.body.contents().filter((index, node) => node.type === 'comment').remove();
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        meta.body.find('div, p').filter((i,elem) => $(elem).text().trim() === '').remove();
        _set_ingest_settings(asset, meta);
        asset.set_main_image(meta.main_image, '');
        asset.set_thumbnail(meta.main_image);
        asset.render();
        hatch.save_asset(asset);
        console.log('processing',title);

    }).catch((err) => {
        console.log('Ingest gallery error: '+err);
        return ingest_gallery(hatch, uri);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri, 'windows-874').then(($) => {
        const description = $('meta[name="description"]').attr('content');
        const thumb_url = $('meta[property="og:image"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const video_url = $('.embed-container').find('iframe').attr('src') || '';
        console.log(video_url);

        return libingester.util.fetch_html(video_url).then(($video) => {
            const download_uri = $video('source').attr('src');
            for (const domain of VIDEO_IFRAMES) {
                if (video_url.includes(domain)) {
                    const thumbnail = libingester.util.download_image(thumb_url);
                    thumbnail.set_title(title);
                    hatch.save_asset(thumbnail);

                    const video = new libingester.VideoAsset();
                    video.set_canonical_uri(uri);
                    video.set_download_uri(download_uri);
                    video.set_synopsis(description);
                    video.set_thumbnail(thumbnail);
                    video.set_title(title);
                    hatch.save_asset(video);
                }
            }
        })

    }).catch((err) => {
        console.log('Ingest video error: '+err);
        return ingest_video(hatch, uri);
    });
}

function ingest_by_category(hatch, link) {
    if (link.includes('/views')) {
        return ingest_article_format2(hatch, link);
    }
    else {
        return ingest_article_format1(hatch, link);
    }
}

function main() {
    const hatch = new libingester.Hatch('siamsport', 'th');

    ingest_gallery(hatch, 'http://www.siamsport.co.th/SiamsportPhoto/show.php?id=1791')
        .then(() => hatch.finish());

    // const article = libingester.util.fetch_html(uri_article).then(($) =>
    //      Promise.all(
    //         $('tr[valign="top"] td a').get().map((a) => {
    //             return libingester.util.fetch_html(a.attribs.href).then(($) => {
    //                 const u = $('META').attr('content');
    //                 if (u) {
    //                     let link = u.substring(u.indexOf('http'));
    //                     const uri = link.includes('siamsport.co.th') ? link : a.attribs.href;
    //                     return ingest_article(hatch, uri);
    //
    //                 }
    //             })
    //         })
    //     )
    // );

    // const gallery = libingester.util.fetch_html(uri_gallery).then(($) => {
    //     const links = $('.pink18-link').get().map((a) => url.resolve(uri_gallery, a.attribs.href));
    //     return Promise.all(links.map((uri) => ingest_gallery(hatch, uri)));
    // });

    // const video = libingester.util.fetch_html(uri_video).then(($) => {
    //     const links = $('.top-pic a').get().map((a) => url.resolve(uri_video, a.attribs.href));
    //     return Promise.all(links.map((uri) => ingest_video(hatch, uri)));
    // });
    //
    // // Promise.all([article, gallery, video]).then(() => {
    //
    // //
    // Promise.all([gallery])
    //     .then(() => hatch.finish());
}

main();
