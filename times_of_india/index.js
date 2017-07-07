'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');
const url = require('url');

const BASE_URI = 'http://timesofindia.indiatimes.com/';
const MAX_LINKS = 3; // max links per 'rss'
const RSS_FEED = [
    'http://timesofindia.indiatimes.com/rssfeedstopstories.cms', // Top Stories
    'http://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', // India
    'http://timesofindia.indiatimes.com/rssfeeds/296589292.cms', // World
     'http://timesofindia.indiatimes.com/rssfeeds/7098551.cms', // NRI
    'http://timesofindia.indiatimes.com/rssfeeds/1898055.cms', // Business
    'http://timesofindia.indiatimes.com/rssfeeds/4719161.cms', // Cricket
    'http://timesofindia.indiatimes.com/rssfeeds/4719148.cms', //Sports
    'http://timesofindia.indiatimes.com/rssfeeds/3908999.cms', // Healt
    'http://timesofindia.indiatimes.com/rssfeeds/-2128672765.cms', // Science
    'http://timesofindia.indiatimes.com/rssfeeds/2647163.cms', // Enviroment
    'http://timesofindia.indiatimes.com/rssfeeds/5880659.cms', // Tech
    'http://timesofindia.indiatimes.com/rssfeeds/913168846.cms', // Education
    'http://timesofindia.indiatimes.com/rssfeeds/784865811.cms', // Opinion
    'http://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', // Entertaiment
    'http://timesofindia.indiatimes.com/rssfeeds/2886704.cms' // Life & Style
];

// cleaning elements
const CLEAM_ELEMENTS = [
    'a',
    'div',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'ul'
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'data-field',
    'data-original',
    'h',
    'height',
    'id',
    'itemscope',
    'itemprop',
    'itemtype',
    'photoid',
    'rel',
    'sizes',
    'style',
    'title',
    'type',
    'w',
    'width'
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.cmnttxt',
    '.similar-articles',
    '.last8brdiv',
    '.mCustomScrollBox',
    'div',
    'a[data-type="tilCustomLink"]'
];

const CUSTOM_CSS = `
$primary-light-color: #658C96;
$primary-medium-color: #222222;
$primary-dark-color: #BE2819;
$accent-light-color: #EA2927;
$accent-dark-color: #902310;
$background-light-color: #FDFDFD;
$background-dark-color: #EEEEEE;
$title-font: 'Roboto';
$body-font: 'Spectral';
$display-font: 'Roboto';
$context-font: 'Roboto';
$support-font: 'Roboto';

@import '_default';
`;

// delete duplicated elements in array
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('span[itemprop=author]').text();
        let body = $('div.Normal').first().attr('id','mybody');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[itemprop="dateModified"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Times of india';
        const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[itemprop="articleSection"]').attr('content') || 'Article';
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        // console.log('--------------------------------------------------------');
        // console.log(uri);
        // console.log('author: '+ author);
        // //console.log('body: '+ body);
        // console.log('canonical_uri: '+ canonical_uri);
        // console.log('modified_date: '+ modified_date);
        // console.log('page: '+ page);
        // console.log('read_more: '+ read_more);
        // console.log('synopsis: '+ synopsis);
        // console.log('section: '+ section);
        // console.log('title: '+ title);
        // console.log('uri_main_image: '+ uri_main_image);
        // console.log('--------------------------------------------------------');

        // Pull out the main image
        let main_image, image_credit;
        if (uri_main_image) {
            main_image = libingester.util.download_image(uri_main_image, uri);
            main_image.set_title(title);
            image_credit = $('img_cptn').first().text() || $('div.title').text() ||'';
            console.log(image_credit);
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }


        // the content body does not have tags 'p', then add the tag wrapper,
        // a paragraph ends when a tag 'br' is found
        let content = $('<div></div>');
        let last_p; // reference to the paragraph we are constructing
        body.contents().map((i,elem) => {
            // We start by validating if the 'elem' is text, or any other label that is not 'br'
            if ((elem.type == 'text' && elem.data.trim() != '') || elem.name != 'br') {
                if (!last_p) { // constructing a new paragraph
                    content.append($('<p></p>'));
                    last_p = content.find('p').last();
                }
                // if element is a 'div', check if the children are pictures
                // and if true, we create the corresponding tags (figure, figcaption)
                const attribs = elem.attribs || {};
                if (elem.name == 'div' && attribs.class=='image') {
                    elem.name='figure';
                    const figcaption = $(elem).next();
                    if (figcaption[0].name=='strong') {
                        $(elem).append(`<figcaption><p>${figcaption.text()}</p></figcaption>`);
                        figcaption.attr('class', 'remove');
                    }
                    const img = $(elem).find('img').first();
                    img[0].attribs.src=url.resolve(BASE_URI, img[0].attribs.src);
                    const image = libingester.util.download_img(img);
                    image.set_title(title);
                    hatch.save_asset(image);
                    // console.log($(elem).html());
                    content.append($(elem).clone());
                    return;
                }
                last_p.append($(elem).clone());
            } else if (elem.name == 'br') {
                // when we find a 'br', it's time to start with another paragraph
                last_p = undefined;
                $(elem).remove();
            }
        });
        body = content;

        body.find('.remove').remove();


        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();
        //

        //console.log(body.html());
        //  //Download image
        //  body.find('div.image').map((i, elem) => {
        //     const img = $(elem).find('img').first();
        //     const caption = $(elem).next().next().text() || '';
        //     const image = `<img src="${img.attr('src')}" alt="${img.attr('alt')}">`;
        //     const figure = $(`<figure>${image}</figure>`);
        //     const figcaption = $(`<figcaption><p>${caption}</p></figcaption>`);
        //     caption.remove();
        //     const down_img = libingester.util.download_img($(figure.children()[0]));
        //     down_img.set_title(title);
        //     if (!thumbnail) asset.set_thumbnail(thumbnail=down_img);
        //     hatch.save_asset(down_img);
        //     $(elem).replaceWith(figure.append(figcaption));
        // });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        //body.find('.tinlienquan').removeAttr('class');
       body.find(REMOVE_ELEMENTS.join(',')).remove();
       body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

       // Set h2 on p > strong
       body.find('p').map((i,elem)=>{
           const strong = $(elem).find('strong').first();
            if (strong[0]) {
                const h2 = $(`<h2>${strong.text()}</h2>`);
                $(elem).replaceWith(h2);
            }
        });
        //
        // // //download image
        // body.find('div[type="Photo"]').map(function() {
        //     const img =$(this).find('img').first();
        //     if(img[0]){
        //         const src=img[0].attribs.src;
        //         const alt=img[0].attribs.alt || '';
        //         const figcaption = $(this).find('.PhotoCMS_Caption').first().text();
        //         const figure = $(`<figure><img alt="${alt}" src="${src}" /></figure>`);
        //         img.remove();
        //         if (figcaption) figure.append($(`<figcaption><p>${figcaption}</p></figcaption>`));
        //         const image = libingester.util.download_img($(figure.children()[0]));
        //         image.set_title(title);
        //         hatch.save_asset(image);
        //         $(this).replaceWith(figure);
        //     }
        //     else {
        //         $(this).remove();
        //     }
        // });
        // const last_p = body.find('p').last();
        // if(last_p.text().includes('TV Online')) last_p.remove();
        //
        // Article Settings
        console.log('processing', title);
        asset.set_authors([author]);
        asset.set_canonical_uri(canonical_uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(Date.now(modified_date));
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(synopsis);
        asset.set_title(title);
        asset.set_main_image(main_image, image_credit);
        asset.set_body(body);

        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err);
        if (err.code == -1 || err.statusCode == 403) {
            console.log('Ingest error:' + err);
        }
    });
}

// return the items for one link
function _load_rss(rss_uri) {
    return new Promise((resolve, reject) => {
        rss2json.load(rss_uri, (err, rss) => {
            if (err) reject(err);
            else resolve(rss.items.slice(0,MAX_LINKS));
        });
    });
}

// return all links found in rss
function _load_all_rss_links(rss_list) {
    let all_links = [];
    return Promise.all(rss_list.map(rss => _load_rss(rss).then(items => {
        items.map(item => all_links.push(item.link));
    }))).then(() => all_links.unique());
}

function main() {
    const hatch = new libingester.Hatch('Times_of_india', 'en');


    // ingest_article(hatch,'http://timesofindia.indiatimes.com/world/europe/spains-running-of-the-bulls-firecracker-kicks-off-fiesta/articleshow/59473763.cms')
    // .then(()=> hatch.finish()
    // );

    _load_all_rss_links(RSS_FEED).then(links =>
        Promise.all(links.map(link => ingest_article(hatch, link)))
            .then(() => hatch.finish())
    ).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
